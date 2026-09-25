"""WRF (wrfout) precipitation reader.

Total precipitation = RAINC + RAINNC + RAINSH (+ bucket terms if BUCKET_MM > 0).
All three are accumulated since the simulation start, so a window total is the
difference between the accumulations at the window's end and start times.
"""
from __future__ import annotations

import glob
import logging
import os
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

import numpy as np

from grids import Field, bilinear_from_arrays, _bilinear_weights, regular_from_curvilinear

log = logging.getLogger("wrf")

TFMT = "%Y-%m-%d_%H:%M:%S"


def _chartime(arr) -> list[datetime]:
    out = []
    for row in np.asarray(arr):
        s = b"".join(row).decode() if row.dtype.kind == "S" else "".join(row.astype(str))
        out.append(datetime.strptime(s.strip(), TFMT))
    return out


@dataclass
class WrfFile:
    path: str
    times: list[datetime]


@dataclass
class WrfRun:
    run_id: str
    init: datetime
    files: list[WrfFile]
    attrs: dict = field(default_factory=dict)
    # filled lazily
    _grid: Optional[dict] = None
    _times: Optional[list] = None
    _tset: Optional[set] = None

    @property
    def times(self) -> list[datetime]:
        if self._times is None:
            self._times = sorted({t for f in self.files for t in f.times})
            self._tset = set(self._times)
        return self._times

    @property
    def end(self) -> datetime:
        return self.times[-1]

    def summary(self) -> dict:
        ts = self.times
        step_h = (ts[1] - ts[0]).total_seconds() / 3600 if len(ts) > 1 else None
        return {
            "id": self.run_id,
            "init": self.init.isoformat() + "Z",
            "end": self.end.isoformat() + "Z",
            "forecastHours": int((self.end - self.init).total_seconds() // 3600),
            "outputIntervalHours": step_h,
            "nTimes": len(ts),
            "files": [os.path.basename(f.path) for f in self.files],
            "dxKm": (self.attrs.get("DX") or 0) / 1000.0,
            "gridId": self.attrs.get("GRID_ID"),
            "projection": self.attrs.get("MAP_PROJ_CHAR"),
            "physics": {k: self.attrs.get(k) for k in (
                "MP_PHYSICS", "CU_PHYSICS", "BL_PBL_PHYSICS", "SF_SURFACE_PHYSICS",
                "RA_LW_PHYSICS", "RA_SW_PHYSICS") if k in self.attrs},
            "title": self.attrs.get("TITLE", "").strip(),
        }


class WrfStore:
    """Index of all WRF runs found by a glob, with an in-memory LRU of loaded fields."""

    def __init__(self, pattern: str, cache_runs: int = 6):
        self.pattern = pattern
        self.runs: dict[str, WrfRun] = {}
        self.warnings: list[str] = []
        self._acc_cache: "OrderedDict[str, tuple[list[datetime], np.ndarray]]" = OrderedDict()
        self._cache_runs = cache_runs

    # ------------------------------------------------------------------ index
    def scan(self) -> None:
        from netCDF4 import Dataset

        self.runs.clear()
        self.warnings.clear()
        self._acc_cache.clear()
        paths = sorted(p for p in glob.glob(self.pattern, recursive=True) if os.path.isfile(p))
        if not paths:
            self.warnings.append(f"No WRF files matched {self.pattern}")
        groups: dict[str, list[tuple[WrfFile, dict]]] = {}
        for p in paths:
            try:
                with Dataset(p) as ds:
                    times = _chartime(ds.variables["Times"][:])
                    attrs = {k: ds.getncattr(k) for k in ds.ncattrs()}
                    if "RAINNC" not in ds.variables and "RAINC" not in ds.variables:
                        self.warnings.append(f"{os.path.basename(p)}: no RAINC/RAINNC, skipped")
                        continue
            except Exception as exc:  # noqa: BLE001
                self.warnings.append(f"{os.path.basename(p)}: unreadable ({exc})")
                continue
            start = str(attrs.get("SIMULATION_START_DATE", attrs.get("START_DATE", ""))).strip()
            key = f"d{int(attrs.get('GRID_ID', 0)):02d}_{start}"
            for k, v in list(attrs.items()):
                if isinstance(v, np.generic):
                    attrs[k] = v.item()
                elif isinstance(v, np.ndarray):
                    attrs[k] = v.tolist()
            groups.setdefault(key, []).append((WrfFile(p, times), attrs))
        for key, items in groups.items():
            attrs = items[0][1]
            start = str(attrs.get("SIMULATION_START_DATE", "")).strip()
            try:
                init = datetime.strptime(start, TFMT)
            except ValueError:
                init = min(t for f, _ in items for t in f.times)
            run_id = f"{init:%Y%m%d%H}_d{int(attrs.get('GRID_ID', 0)):02d}"
            files = sorted((f for f, _ in items), key=lambda f: f.times[0])
            self.runs[run_id] = WrfRun(run_id, init, files, attrs)
        log.info("WRF: %d run(s) from %d file(s)", len(self.runs), len(paths))

    # ------------------------------------------------------------------ grid
    def grid(self, run: WrfRun) -> dict:
        if run._grid is not None:
            return run._grid
        from netCDF4 import Dataset

        with Dataset(run.files[0].path) as ds:
            lat2d = np.asarray(ds.variables["XLAT"][0], dtype=np.float64)
            lon2d = np.asarray(ds.variables["XLONG"][0], dtype=np.float64)
            lat_v = np.asarray(ds.variables["XLAT_V"][0], dtype=np.float64) if "XLAT_V" in ds.variables else None
            lon_u = np.asarray(ds.variables["XLONG_U"][0], dtype=np.float64) if "XLONG_U" in ds.variables else None
        lats, lons = lat2d[:, 0], lon2d[0, :]
        rect = (np.nanmax(np.abs(lat2d - lats[:, None])) < 1e-3 and
                np.nanmax(np.abs(lon2d - lons[None, :])) < 1e-3)
        g: dict = {"rectilinear": bool(rect), "shape": lat2d.shape}
        if rect:
            g["lats"], g["lons"] = lats, lons
            g["lat_edges"] = lat_v[:, 0] if lat_v is not None else None
            g["lon_edges"] = lon_u[0, :] if lon_u is not None else None
        else:
            step = max(float(run.attrs.get("DX", 9000.0)) / 111_000.0, 0.01)
            rl, ro, idx, valid = regular_from_curvilinear(lat2d, lon2d, step)
            g.update(lats=rl, lons=ro, idx=idx, valid=valid, lat_edges=None, lon_edges=None)
            self.warnings.append(f"{run.run_id}: non-rectilinear projection, resampled to {step:.3f} deg")
        run._grid = g
        return g

    def _to_field_values(self, run: WrfRun, arr2d: np.ndarray) -> np.ndarray:
        g = self.grid(run)
        if g["rectilinear"]:
            return arr2d
        out = arr2d.ravel()[g["idx"]]
        return np.where(g["valid"], out, np.nan)

    def _field(self, wrun: WrfRun, values: np.ndarray, **meta) -> Field:
        g = self.grid(wrun)
        return Field(g["lats"], g["lons"], self._to_field_values(wrun, values),
                     g["lat_edges"], g["lon_edges"], meta)

    # ------------------------------------------------------------------ precip
    def accumulations(self, run: WrfRun) -> tuple[list[datetime], np.ndarray]:
        """(times, total accumulated precip [T, ny, nx] in mm) for a run."""
        if run.run_id in self._acc_cache:
            self._acc_cache.move_to_end(run.run_id)
            return self._acc_cache[run.run_id]
        from netCDF4 import Dataset

        times: list[datetime] = []
        chunks: list[np.ndarray] = []
        for wf in run.files:
            with Dataset(wf.path) as ds:
                v = ds.variables
                tot = None
                for name in ("RAINC", "RAINNC", "RAINSH"):
                    if name in v:
                        a = np.asarray(v[name][:], dtype=np.float64)
                        tot = a if tot is None else tot + a
                bucket = float(run.attrs.get("BUCKET_MM", -1.0) or -1.0)
                if bucket > 0:
                    for name in ("I_RAINC", "I_RAINNC"):
                        if name in v:
                            tot = tot + bucket * np.asarray(v[name][:], dtype=np.float64)
                times.extend(wf.times)
                chunks.append(tot.astype(np.float32))
        acc = np.concatenate(chunks, axis=0)
        order = np.argsort(np.array(times, dtype="datetime64[s]"), kind="stable")
        times = [times[i] for i in order]
        acc = acc[order]
        # de-duplicate identical times (overlapping files)
        keep = [0] + [i for i in range(1, len(times)) if times[i] != times[i - 1]]
        times = [times[i] for i in keep]
        acc = acc[keep]
        self._acc_cache[run.run_id] = (times, acc)
        while len(self._acc_cache) > self._cache_runs:
            self._acc_cache.popitem(last=False)
        return times, acc

    def window_total(self, run: WrfRun, start: datetime, end: datetime) -> Optional[Field]:
        times, acc = self.accumulations(run)
        if start not in times or end not in times:
            return None
        i0, i1 = times.index(start), times.index(end)
        vals = np.clip(acc[i1] - acc[i0], 0.0, None)
        lead0 = (start - run.init).total_seconds() / 3600
        lead1 = (end - run.init).total_seconds() / 3600
        return self._field(run, vals, source="wrf", run=run.run_id,
                           windowStart=start.isoformat() + "Z", windowEnd=end.isoformat() + "Z",
                           leadHours=[lead0, lead1], units="mm")

    def covers(self, run: WrfRun, start: datetime, end: datetime) -> bool:
        ts = self.times_set(run)
        return start in ts and end in ts

    def times_set(self, run: WrfRun) -> set:
        run.times  # noqa: B018  (populates the cached set)
        return run._tset

    def pick_run(self, start: datetime, end: datetime, lead_day: int) -> Optional[WrfRun]:
        """Run whose forecast day `lead_day` contains the window [start, end]."""
        best = None
        for run in self.runs.values():
            lead_start_h = (start - run.init).total_seconds() / 3600
            if lead_start_h < 0 or not self.covers(run, start, end):
                continue
            if int(lead_start_h // 24) + 1 != lead_day:
                continue
            if best is None or run.init > best.init:
                best = run
        return best

    def hourly_at_points(self, run: WrfRun, lats: np.ndarray, lons: np.ndarray, method: str):
        """Per-output-interval precip (mm) at points: returns (end_times, [npts, nt-1])."""
        times, acc = self.accumulations(run)
        inc = np.clip(np.diff(acc, axis=0), 0.0, None)  # [nt-1, ny, nx]
        g = self.grid(run)
        if not g["rectilinear"]:
            inc = np.stack([self._to_field_values(run, x) for x in inc])
        f0 = Field(g["lats"], g["lons"], inc[0], g["lat_edges"], g["lon_edges"])
        if method == "bilinear":
            w = _bilinear_weights(f0, np.asarray(lats, float), np.asarray(lons, float))
            series = bilinear_from_arrays(inc, w)  # [nt-1, npts]
        else:
            ii = np.searchsorted(f0.lat_edges, lats, side="right") - 1
            jj = np.searchsorted(f0.lon_edges, lons, side="right") - 1
            ok = (ii >= 0) & (ii < f0.lats.size) & (jj >= 0) & (jj < f0.lons.size)
            series = np.full((inc.shape[0], len(lats)), np.nan, dtype=np.float32)
            series[:, ok] = inc[:, ii[ok], jj[ok]]
        return times[1:], series.T

    def domain_bounds(self) -> Optional[list[float]]:
        b = None
        for run in self.runs.values():
            try:
                g = self.grid(run)
            except Exception:  # noqa: BLE001
                continue
            s, n = float(np.min(g["lats"])), float(np.max(g["lats"]))
            w, e = float(np.min(g["lons"])), float(np.max(g["lons"]))
            b = [s, w, n, e] if b is None else [min(b[0], s), min(b[1], w), max(b[2], n), max(b[3], e)]
        return b
