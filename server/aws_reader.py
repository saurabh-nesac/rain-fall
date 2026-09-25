"""AWS / ARG daily rainfall reader for the wide Excel layout:

SL.NO | STATE | DISTRICT | STATION | LATITUDE | LONGITUDE | ALTITUDE | TYPE | TIME (UTC) | 9/1/2026 | 9/2/2026 | ...

Each date column holds the 24 h rainfall reported at TIME (UTC) on that date,
i.e. the window [date-1 03 UTC, date 03 UTC] under IMD convention.
Blank cells are MISSING (not zero) unless aws_blank_is_zero is set.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Optional

import numpy as np
import pandas as pd

log = logging.getLogger("aws")

_TRACE = {"TR", "TRACE", "T"}
_REQUIRED = {"STATE", "DISTRICT", "STATION", "LATITUDE", "LONGITUDE"}


def _norm_col(c) -> str:
    return re.sub(r"\s+", " ", str(c)).strip().upper()


def _as_date(c) -> Optional[date]:
    if isinstance(c, (pd.Timestamp, datetime)):
        return c.date()
    if isinstance(c, date):
        return c
    s = str(c).strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _title(s: str) -> str:
    s = re.sub(r"[_\s]+", " ", str(s)).strip()
    return " ".join(w.capitalize() for w in s.split(" ") if w)


def _slug(*parts) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", "_".join(str(p).upper() for p in parts)).strip("_")


def _to_float(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, str):
        t = v.strip().upper()
        if t == "":
            return None
        if t in _TRACE:
            return 0.0
        try:
            v = float(t)
        except ValueError:
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if np.isnan(f) or f < 0 or f > 1500:  # -999 style missing codes / garbage
        return None
    return f


@dataclass
class AwsStation:
    id: str
    name: str
    state: str
    district: str
    lat: float
    lng: float
    elevation: Optional[float]
    sensor_type: str
    report_hour_utc: Optional[int]
    source_file: str
    series: dict[str, Optional[float]] = field(default_factory=dict)  # iso date -> mm

    def to_json(self) -> dict:
        vals = [v for v in self.series.values() if v is not None]
        return {
            "id": self.id,
            "name": self.name,
            "state": self.state,
            "district": self.district,
            "lat": self.lat,
            "lng": self.lng,
            "elevationMeters": self.elevation,
            "sensorType": self.sensor_type,
            "reportHourUtc": self.report_hour_utc,
            "daysReported": len(vals),
            "daysInSheet": len(self.series),
            "status": "active" if vals else "offline",
        }


class AwsStore:
    def __init__(self, files: list[str], sheet=0, blank_is_zero: bool = False):
        self.files = files
        self.sheet = sheet
        self.blank_is_zero = blank_is_zero
        self.stations: dict[str, AwsStation] = {}
        self.warnings: list[str] = []

    def scan(self) -> None:
        self.stations.clear()
        self.warnings.clear()
        for path in self.files:
            if not os.path.isfile(path):
                self.warnings.append(f"AWS file not found: {path}")
                continue
            try:
                self._read(path)
            except Exception as exc:  # noqa: BLE001
                self.warnings.append(f"{os.path.basename(path)}: {exc}")
        self._check_duplicates()
        log.info("AWS: %d stations", len(self.stations))

    def _read(self, path: str) -> None:
        raw = pd.read_excel(path, sheet_name=self.sheet, header=None, dtype=object)
        # find the header row (the one containing LATITUDE)
        hdr_row = None
        for i in range(min(len(raw), 15)):
            cols = {_norm_col(c) for c in raw.iloc[i].tolist()}
            if "LATITUDE" in cols and "LONGITUDE" in cols:
                hdr_row = i
                break
        if hdr_row is None:
            raise ValueError("header row with LATITUDE/LONGITUDE not found")
        header = raw.iloc[hdr_row].tolist()
        df = raw.iloc[hdr_row + 1:].reset_index(drop=True)
        names = []
        date_cols: dict[int, date] = {}
        for k, c in enumerate(header):
            d = _as_date(c)
            if d is not None and _norm_col(c) not in _REQUIRED:
                date_cols[k] = d
                names.append(f"__d{k}")
            else:
                names.append(_norm_col(c))
        df.columns = names
        missing = _REQUIRED - set(names)
        if missing:
            raise ValueError(f"missing columns: {sorted(missing)}")
        if not date_cols:
            raise ValueError("no date columns recognised in header")
        time_col = next((n for n in names if n.startswith("TIME")), None)
        alt_col = next((n for n in names if n.startswith("ALTITUDE") or n.startswith("ELEV")), None)
        type_col = "TYPE" if "TYPE" in names else None
        fname = os.path.basename(path)

        for _, row in df.iterrows():
            stn = row.get("STATION")
            if stn is None or (isinstance(stn, float) and np.isnan(stn)) or str(stn).strip() == "":
                continue
            lat, lon = _to_float(row.get("LATITUDE")), _to_float(row.get("LONGITUDE"))
            state_raw, dist_raw = str(row.get("STATE", "")).strip(), str(row.get("DISTRICT", "")).strip()
            if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
                self.warnings.append(f"{fname}: {stn} has no valid coordinates, skipped")
                continue
            sid = _slug(state_raw, dist_raw, stn)
            hour = None
            tv = row.get(time_col) if time_col else None
            if isinstance(tv, (time, datetime, pd.Timestamp)):
                hour = tv.hour
            elif isinstance(tv, str) and re.match(r"^\s*\d{1,2}:\d{2}", tv):
                hour = int(tv.strip().split(":")[0])
            elif isinstance(tv, (int, float)) and not np.isnan(tv):
                hour = int(round(float(tv) * 24)) % 24 if tv < 1 else int(tv)
            st = self.stations.get(sid)
            if st is None:
                alt = _to_float(row.get(alt_col)) if alt_col else None
                st = AwsStation(
                    id=sid,
                    name=_title(stn),
                    state=_title(state_raw),
                    district=_title(dist_raw),
                    lat=round(lat, 5),
                    lng=round(lon, 5),
                    elevation=alt,
                    sensor_type=str(row.get(type_col)).strip().upper() if type_col and row.get(type_col) is not None else "AWS",
                    report_hour_utc=hour,
                    source_file=fname,
                )
                self.stations[sid] = st
            for k, d in date_cols.items():
                v = _to_float(row.get(f"__d{k}"))
                if v is None and self.blank_is_zero:
                    cell = row.get(f"__d{k}")
                    if cell is None or (isinstance(cell, float) and np.isnan(cell)) or str(cell).strip() == "":
                        v = 0.0
                prev = st.series.get(d.isoformat())
                st.series[d.isoformat()] = v if v is not None else prev

    def _check_duplicates(self) -> None:
        seen: dict[tuple, str] = {}
        for st in self.stations.values():
            key = (round(st.lat, 4), round(st.lng, 4))
            if key in seen:
                self.warnings.append(
                    f"{st.name} ({st.district}) shares coordinates with {seen[key]} - check the sheet")
            else:
                seen[key] = f"{st.name} ({st.district})"
        hours = {s.report_hour_utc for s in self.stations.values() if s.report_hour_utc is not None}
        if hours and hours != {3}:
            self.warnings.append(f"AWS report hours found: {sorted(hours)} UTC; windows assume 03 UTC")

    # ------------------------------------------------------------------ queries
    def dates(self) -> list[str]:
        ds = {d for s in self.stations.values() for d, v in s.series.items()}
        return sorted(ds)

    def dates_with_data(self) -> list[str]:
        ds = {d for s in self.stations.values() for d, v in s.series.items() if v is not None}
        return sorted(ds)

    def arrays(self):
        ids = list(self.stations)
        lats = np.array([self.stations[i].lat for i in ids])
        lons = np.array([self.stations[i].lng for i in ids])
        return ids, lats, lons
