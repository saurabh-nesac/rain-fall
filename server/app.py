"""NER rainfall validation backend (WRF vs GPM vs BFS vs AWS).

Run:  uvicorn app:app --port 8000        (from the server/ folder)
"""
from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from aws_reader import AwsStore
from bfs_reader import BfsStore
from config import load_config
from gpm_reader import GpmStore
from grids import Field, crop, field_stats, field_to_json, regrid, sample
from wrf_reader import WrfStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("app")

SOURCES = ("wrf", "gpm", "bfs")


def _num(v) -> Optional[float]:
    if v is None:
        return None
    f = float(v)
    return None if np.isnan(f) else round(f, 2)


class DataHub:
    """Owns all readers. A single lock serialises file access (netCDF4/HDF5 are not thread-safe)."""

    def __init__(self):
        self.lock = threading.RLock()
        self.cfg: dict = {}
        self.loaded_at: Optional[str] = None
        self._fields: "OrderedDict[tuple, Optional[Field]]" = OrderedDict()
        self._validation: "OrderedDict[tuple, dict]" = OrderedDict()

    # ------------------------------------------------------------------ lifecycle
    def load(self) -> None:
        with self.lock:
            t0 = time.time()
            self.cfg = cfg = load_config()
            self.wrf = WrfStore(cfg["wrf_glob"])
            self.aws = AwsStore(cfg["aws_files"], cfg["aws_sheet"], cfg["aws_blank_is_zero"])
            self.gpm = GpmStore(cfg["gpm_dir"], cfg["gpm_glob"], cfg["gpm_variable"], cache_files=240)
            self.bfs = BfsStore(cfg["bfs_dir"], cfg["bfs_glob"], cfg["bfs_date_offset_days"])
            for name, fn in (("wrf", self.wrf.scan), ("aws", self.aws.scan), ("bfs", self.bfs.scan)):
                try:
                    fn()
                except Exception as exc:  # noqa: BLE001
                    log.exception("%s scan failed", name)
                    getattr(self, name).warnings.append(f"scan failed: {exc}")
            wb = None
            try:
                wb = self.wrf.domain_bounds()
            except Exception as exc:  # noqa: BLE001
                self.wrf.warnings.append(f"grid read failed: {exc}")
            if wb:
                bbox = [wb[0] - 0.5, wb[1] - 0.5, wb[2] + 0.5, wb[3] + 0.5]
            else:
                lo, hi, la, lb = cfg["bbox"]
                bbox = [la, lo, lb, hi]
            try:
                self.gpm.scan(bbox)
            except Exception as exc:  # noqa: BLE001
                self.gpm.warnings.append(f"scan failed: {exc}")
            self._fields.clear()
            self._validation.clear()
            self.loaded_at = datetime.utcnow().isoformat() + "Z"
            log.info("data loaded in %.1fs", time.time() - t0)

    # ------------------------------------------------------------------ windows
    def window(self, day: str) -> tuple[datetime, datetime]:
        d = date.fromisoformat(day)
        end = datetime(d.year, d.month, d.day, int(self.cfg["day_end_hour_utc"]))
        return end - timedelta(hours=24), end

    # ------------------------------------------------------------------ fields
    def field(self, source: str, day: str, lead_day: int = 1) -> Optional[Field]:
        key = (source, day, lead_day if source == "wrf" else 0)
        with self.lock:
            if key in self._fields:
                self._fields.move_to_end(key)
                return self._fields[key]
            start, end = self.window(day)
            f: Optional[Field] = None
            if source == "wrf":
                run = self.wrf.pick_run(start, end, lead_day)
                if run is not None:
                    f = self.wrf.window_total(run, start, end)
                    if f is not None:
                        f.meta["leadDay"] = lead_day
            elif source == "gpm":
                f = self.gpm.window_total(start, end, float(self.cfg["gpm_min_fraction"]))
            elif source == "bfs":
                f = self.bfs.field(day)
            if f is not None:
                f.meta.setdefault("date", day)
                f.meta.setdefault("windowStart", start.isoformat() + "Z")
                f.meta.setdefault("windowEnd", end.isoformat() + "Z")
            self._fields[key] = f
            while len(self._fields) > 150:
                self._fields.popitem(last=False)
            return f

    # ------------------------------------------------------------------ catalog
    def catalog(self) -> dict:
        with self.lock:
            runs = [r.summary() for r in sorted(self.wrf.runs.values(), key=lambda r: r.init)]
            wrf_dates: dict[str, list[int]] = {}
            h = int(self.cfg["day_end_hour_utc"])
            for r in self.wrf.runs.values():
                # every complete 03Z->03Z window inside the run, tagged with its lead day
                first_end = datetime(r.init.year, r.init.month, r.init.day, h)
                if first_end - timedelta(hours=24) < r.init:
                    first_end += timedelta(days=1)
                e = first_end
                while e <= r.end:
                    s = e - timedelta(hours=24)
                    if self.wrf.covers(r, s, e):
                        lead = int(((s - r.init).total_seconds() / 3600) // 24) + 1
                        wrf_dates.setdefault(e.date().isoformat(), []).append(lead)
                    e += timedelta(days=1)
            bfs_numeric = None
            if self.bfs.files:
                try:
                    first = sorted(self.bfs.files)[0]
                    img = self.bfs.image(first)
                    bfs_numeric = bool(img and img["numeric"])
                except Exception as exc:  # noqa: BLE001
                    self.bfs.warnings.append(f"could not open BFS file: {exc}")
            return {
                "loadedAt": self.loaded_at,
                "dayEndHourUtc": h,
                "stationSampling": self.cfg["station_sampling"],
                "runs": runs,
                "dates": {
                    "wrf": {d: sorted(set(v)) for d, v in sorted(wrf_dates.items())},
                    "gpm": self.gpm.available_dates(h, float(self.cfg["gpm_min_fraction"])),
                    "bfs": sorted(self.bfs.files),
                    "aws": self.aws.dates_with_data(),
                },
                "bfsNumeric": bfs_numeric,
                "counts": {
                    "wrfRuns": len(self.wrf.runs),
                    "gpmFiles": len(self.gpm.files),
                    "bfsFiles": len(self.bfs.files),
                    "awsStations": len(self.aws.stations),
                    "awsStationsReporting": sum(1 for s in self.aws.stations.values()
                                                if any(v is not None for v in s.series.values())),
                },
                "sources": {
                    "wrf": {"pattern": self.cfg["wrf_glob"], "warnings": self.wrf.warnings[-20:]},
                    "gpm": {"dir": self.cfg["gpm_dir"], "pattern": self.cfg["gpm_glob"],
                            "warnings": self.gpm.warnings[-20:]},
                    "bfs": {"dir": self.cfg["bfs_dir"], "pattern": self.cfg["bfs_glob"],
                            "dateOffsetDays": self.cfg["bfs_date_offset_days"],
                            "warnings": self.bfs.warnings[-20:]},
                    "aws": {"files": self.cfg["aws_files"], "blankIsZero": self.cfg["aws_blank_is_zero"],
                            "warnings": self.aws.warnings[-50:]},
                },
            }

    # ------------------------------------------------------------------ validation table
    def validation(self, start: str, end: str, lead_day: int) -> dict:
        key = (start, end, lead_day)
        with self.lock:
            if key in self._validation:
                return self._validation[key]
            ids, lats, lons = self.aws.arrays()
            d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
            days = [(d0 + timedelta(days=k)).isoformat() for k in range((d1 - d0).days + 1)]
            method = self.cfg["station_sampling"]
            per_station: dict[str, list[dict]] = {i: [] for i in ids}
            availability: dict[str, dict] = {}
            for day in days:
                sampled: dict[str, np.ndarray] = {}
                avail: dict = {}
                for src in SOURCES:
                    f = self.field(src, day, lead_day)
                    avail[src] = f is not None
                    if src == "wrf" and f is not None:
                        avail["wrfRun"] = f.meta.get("run")
                    sampled[src] = sample(f, lats, lons, method) if f is not None and len(ids) else None
                availability[day] = avail
                for k, sid in enumerate(ids):
                    per_station[sid].append({
                        "date": day,
                        "aws": self.aws.stations[sid].series.get(day),
                        "wrf": _num(sampled["wrf"][k]) if sampled["wrf"] is not None else None,
                        "gpm": _num(sampled["gpm"][k]) if sampled["gpm"] is not None else None,
                        "bfs": _num(sampled["bfs"][k]) if sampled["bfs"] is not None else None,
                    })
            out = {"start": start, "end": end, "leadDay": lead_day, "dates": days,
                   "availability": availability, "stations": per_station,
                   "sampling": method, "dayEndHourUtc": self.cfg["day_end_hour_utc"]}
            self._validation[key] = out
            while len(self._validation) > 12:
                self._validation.popitem(last=False)
            return out


hub = DataHub()
app = FastAPI(title="NER Rainfall Validation API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    hub.load()


def _check_day(day: str) -> str:
    try:
        return date.fromisoformat(day).isoformat()
    except ValueError:
        raise HTTPException(400, f"bad date '{day}', expected YYYY-MM-DD")


@app.get("/api/health")
def health():
    return {"status": "ok", "loadedAt": hub.loaded_at}


@app.post("/api/reload")
def reload():
    hub.load()
    return hub.catalog()


@app.get("/api/catalog")
def catalog():
    return hub.catalog()


@app.get("/api/stations")
def stations():
    with hub.lock:
        return [s.to_json() for s in hub.aws.stations.values()]


@app.get("/api/validation")
def validation(start: str, end: str, lead_day: int = Query(1, ge=1, le=10)):
    s, e = _check_day(start), _check_day(end)
    if e < s:
        raise HTTPException(400, "end before start")
    if (date.fromisoformat(e) - date.fromisoformat(s)).days > 400:
        raise HTTPException(400, "range too long (max 400 days)")
    return hub.validation(s, e, lead_day)


@app.get("/api/field")
def field(source: str, date: str, lead_day: int = Query(1, ge=1, le=10), crop_to_wrf: bool = True):
    if source not in SOURCES:
        raise HTTPException(400, f"source must be one of {SOURCES}")
    day = _check_day(date)
    f = hub.field(source, day, lead_day)
    if f is None:
        raise HTTPException(404, f"no {source.upper()} data for {day}"
                                 + (f" (lead day {lead_day})" if source == "wrf" else ""))
    if crop_to_wrf and source != "wrf":
        wb = hub.wrf.domain_bounds()
        if wb:
            f = crop(f, *wb)
    return field_to_json(f)


@app.get("/api/diff")
def diff(a: str, b: str, date: str, lead_day: int = Query(1, ge=1, le=10)):
    """a - b, computed on b's grid (b is normally the observation)."""
    if a not in SOURCES or b not in SOURCES or a == b:
        raise HTTPException(400, "a and b must be two different sources of wrf/gpm/bfs")
    day = _check_day(date)
    fa, fb = hub.field(a, day, lead_day), hub.field(b, day, lead_day)
    if fa is None or fb is None:
        missing = [s.upper() for s, f in ((a, fa), (b, fb)) if f is None]
        raise HTTPException(404, f"no {', '.join(missing)} data for {day}")
    with hub.lock:
        wb = hub.wrf.domain_bounds()
        target = crop(fb, *wb) if wb else fb
        ra = regrid(fa, target)
        d = target.with_values(ra.values - target.values, source=f"{a}-{b}", units="mm",
                               a=a, b=b, date=day, leadDay=lead_day)
        out = field_to_json(d)
        out["statsA"] = field_stats(ra)
        out["statsB"] = field_stats(target)
        return out


@app.get("/api/bfs/meta")
def bfs_meta(date: str):
    day = _check_day(date)
    with hub.lock:
        img = hub.bfs.image(day)
    if img is None:
        raise HTTPException(404, f"no BFS file for {day}")
    return {"numeric": img["numeric"], "bounds": img["bounds"], "file": img["file"]}


@app.get("/api/bfs/image")
def bfs_image(date: str):
    day = _check_day(date)
    with hub.lock:
        img = hub.bfs.image(day)
    if img is None or not img["png"]:
        raise HTTPException(404, f"no BFS image for {day}")
    return Response(img["png"], media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@app.get("/api/station/{station_id}/hourly")
def station_hourly(station_id: str, run: str):
    with hub.lock:
        st = hub.aws.stations.get(station_id)
        r = hub.wrf.runs.get(run)
        if st is None:
            raise HTTPException(404, "unknown station")
        if r is None:
            raise HTTPException(404, "unknown WRF run")
        lat, lon = np.array([st.lat]), np.array([st.lng])
        ends, wrf = hub.wrf.hourly_at_points(r, lat, lon, hub.cfg["station_sampling"])
        step_h = (ends[1] - ends[0]).total_seconds() / 3600 if len(ends) > 1 else 1.0
        g_ends, gpm = hub.gpm.series_at_points(r.init, r.end, lat, lon, step_h)
        gmap = {t: gpm[0, k] for k, t in enumerate(g_ends)}
        rows = []
        for k, t in enumerate(ends):
            rows.append({
                "time": t.isoformat() + "Z",
                "leadHour": round((t - r.init).total_seconds() / 3600, 2),
                "wrf": _num(wrf[0, k]),
                "gpm": _num(gmap.get(t)),
            })
        return {"station": station_id, "run": run, "stepHours": step_h, "rows": rows}


# Serve the built frontend (npm run build -> ../dist) from the same port, if present.
_dist = Path(__file__).resolve().parent.parent / "dist"
if _dist.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
