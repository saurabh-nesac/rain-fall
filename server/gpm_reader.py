"""GPM IMERG half-hourly reader (HDF5 .HDF5 or GES DISC .nc4 subsets).

Both formats are HDF5 underneath, so h5py reads either. IMERG stores
precipitation as a *rate* (mm/hr) on a 0.1 deg grid, laid out (time, lon, lat);
each half-hour file therefore contributes rate * 0.5 mm.
"""
from __future__ import annotations

import glob
import logging
import os
import re
from collections import OrderedDict
from datetime import datetime, timedelta
from typing import Optional

import numpy as np

from grids import Field

log = logging.getLogger("gpm")

# 3B-HHR.MS.MRG.3IMERG.20260923-S003000-E005959.0030.V07B.HDF5
_IMERG_RE = re.compile(r"(\d{8})-S(\d{6})-E(\d{6})")
_VAR_CANDIDATES = ["Grid/precipitation", "precipitation", "Grid/precipitationCal", "precipitationCal"]


class GpmStore:
    def __init__(self, directory: str, pattern: str, variable: str = "", cache_files: int = 1200):
        self.directory = directory
        self.pattern = pattern
        self.variable = variable
        self.files: dict[datetime, tuple[str, float]] = {}  # start -> (path, hours covered)
        self.warnings: list[str] = []
        self.bbox: Optional[list[float]] = None  # [south, west, north, east]
        self._cache: "OrderedDict[str, np.ndarray]" = OrderedDict()
        self._cache_n = cache_files
        self._grid: Optional[tuple[np.ndarray, np.ndarray, slice, slice]] = None
        self._daily_cache: "OrderedDict[tuple, Optional[Field]]" = OrderedDict()

    # ------------------------------------------------------------------ index
    def scan(self, bbox: list[float]) -> None:
        self.files.clear()
        self.warnings.clear()
        self._cache.clear()
        self._daily_cache.clear()
        self._grid = None
        self.bbox = bbox
        if not os.path.isdir(self.directory):
            self.warnings.append(f"GPM directory not found: {self.directory}")
            return
        paths = glob.glob(os.path.join(self.directory, self.pattern), recursive=True)
        bad = 0
        for p in paths:
            if not os.path.isfile(p) or p.lower().endswith((".xml", ".txt", ".md5")):
                continue
            m = _IMERG_RE.search(os.path.basename(p))
            if not m:
                bad += 1
                continue
            day = datetime.strptime(m.group(1), "%Y%m%d")
            s = datetime.strptime(m.group(2), "%H%M%S")
            e = datetime.strptime(m.group(3), "%H%M%S")
            start = day.replace(hour=s.hour, minute=s.minute, second=0)
            dur = ((e - s).total_seconds() + 1) / 3600.0
            if dur <= 0:
                dur += 24
            self.files[start] = (p, round(dur * 2) / 2)
        if bad:
            self.warnings.append(f"{bad} file(s) in GPM dir did not match the IMERG name pattern")
        log.info("GPM: %d half-hourly files", len(self.files))

    # ------------------------------------------------------------------ io
    def _open_grid(self, h5) -> tuple[np.ndarray, np.ndarray, slice, slice, str, bool]:
        var = self.variable or next((c for c in _VAR_CANDIDATES if c in h5), None)
        if var is None:
            raise KeyError("no precipitation variable found (set gpm_variable in config.json)")
        grp = var.rsplit("/", 1)[0] + "/" if "/" in var else ""
        lat = np.asarray(h5[grp + "lat"][:], dtype=np.float64)
        lon = np.asarray(h5[grp + "lon"][:], dtype=np.float64)
        shape = h5[var].shape
        lon_first = shape[-2] == lon.size and shape[-1] == lat.size
        s, w, n, e = self.bbox
        i0, i1 = int(np.searchsorted(lat, s - 0.1)), int(np.searchsorted(lat, n + 0.1))
        j0, j1 = int(np.searchsorted(lon, w - 0.1)), int(np.searchsorted(lon, e + 0.1))
        return lat, lon, slice(i0, i1), slice(j0, j1), var, lon_first

    def _read(self, path: str) -> np.ndarray:
        """Cropped precip rate (mm/hr) as (nlat, nlon), NaN for fill."""
        if path in self._cache:
            self._cache.move_to_end(path)
            return self._cache[path]
        import h5py

        with h5py.File(path, "r") as h5:
            lat, lon, si, sj, var, lon_first = self._open_grid(h5)
            if self._grid is None:
                self._grid = (lat[si], lon[sj], si, sj)
            ds = h5[var]
            if ds.ndim == 3:
                raw = ds[0, sj, si] if lon_first else ds[0, si, sj]
            else:
                raw = ds[sj, si] if lon_first else ds[si, sj]
            arr = np.asarray(raw, dtype=np.float32)
            if lon_first:
                arr = arr.T
            fill = ds.attrs.get("_FillValue", ds.attrs.get("CodeMissingValue", -9999.9))
            try:
                fill = float(np.ravel(fill)[0])
            except (TypeError, ValueError):
                fill = -9999.9
        arr[(arr < 0) | np.isclose(arr, fill)] = np.nan
        self._cache[path] = arr
        while len(self._cache) > self._cache_n:
            self._cache.popitem(last=False)
        return arr

    def _field(self, values: np.ndarray, **meta) -> Field:
        lat, lon, _, _ = self._grid
        return Field(lat, lon, values, meta=meta)

    # ------------------------------------------------------------------ products
    def window_total(self, start: datetime, end: datetime, min_fraction: float = 1.0) -> Optional[Field]:
        key = (start, end, min_fraction)
        if key in self._daily_cache:
            return self._daily_cache[key]
        steps = int((end - start).total_seconds() // 1800)
        slots = [start + timedelta(minutes=30 * k) for k in range(steps)]
        have = [t for t in slots if t in self.files]
        result: Optional[Field] = None
        if have and len(have) / max(len(slots), 1) >= min_fraction - 1e-9:
            total = None
            count = None
            for t in have:
                path, hrs = self.files[t]
                try:
                    rate = self._read(path)
                except Exception as exc:  # noqa: BLE001
                    self.warnings.append(f"{os.path.basename(path)}: {exc}")
                    continue
                mm = rate * hrs
                if total is None:
                    total = np.zeros_like(mm)
                    count = np.zeros(mm.shape, dtype=np.int16)
                ok = ~np.isnan(mm)
                total[ok] += mm[ok]
                count += ok
            if total is not None:
                total[count == 0] = np.nan
                result = self._field(total, source="gpm", units="mm",
                                     windowStart=start.isoformat() + "Z", windowEnd=end.isoformat() + "Z",
                                     filesUsed=len(have), filesExpected=len(slots))
        self._daily_cache[key] = result
        while len(self._daily_cache) > 120:
            self._daily_cache.popitem(last=False)
        return result

    def series_at_points(self, start: datetime, end: datetime, lats, lons, step_hours: float = 1.0):
        """Precip (mm) per `step_hours` interval ending at each step, at points (nearest cell)."""
        n = int(round((end - start).total_seconds() / 3600 / step_hours))
        ends = [start + timedelta(hours=step_hours * (k + 1)) for k in range(n)]
        out = np.full((len(lats), n), np.nan, dtype=np.float32)
        if not self.files:
            return ends, out
        lats = np.asarray(lats, float)
        lons = np.asarray(lons, float)
        idx = None
        for k, t_end in enumerate(ends):
            t0 = t_end - timedelta(hours=step_hours)
            slots = [t0 + timedelta(minutes=30 * m) for m in range(int(step_hours * 2))]
            if not all(s in self.files for s in slots):
                continue
            acc = np.zeros(len(lats), dtype=np.float32)
            for s in slots:
                path, hrs = self.files[s]
                rate = self._read(path)
                if idx is None:
                    f = self._field(rate)
                    ii = np.searchsorted(f.lat_edges, lats, side="right") - 1
                    jj = np.searchsorted(f.lon_edges, lons, side="right") - 1
                    ok = (ii >= 0) & (ii < f.lats.size) & (jj >= 0) & (jj < f.lons.size)
                    idx = (np.where(ok, ii, 0), np.where(ok, jj, 0), ok)
                ii, jj, ok = idx
                v = np.where(ok, rate[ii, jj], np.nan) * hrs
                acc += v
            out[:, k] = acc
        return ends, out

    def available_dates(self, day_end_hour: int, min_fraction: float) -> list[str]:
        """Window-end dates (YYYY-MM-DD) with enough half-hour files."""
        per_day: dict = {}
        for t in self.files:
            end_day = (t - timedelta(hours=day_end_hour)).date() + timedelta(days=1)
            per_day[end_day] = per_day.get(end_day, 0) + 1
        return sorted(d.isoformat() for d, c in per_day.items() if c / 48.0 >= min_fraction - 1e-9)
