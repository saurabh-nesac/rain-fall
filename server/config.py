"""Configuration for the NER validation backend.

Values come from (lowest to highest priority):
  1. DEFAULTS below
  2. server/config.json (if present)
  3. Environment variables NERVAL_<KEY_IN_UPPERCASE>  (lists as ';'-separated)
"""
from __future__ import annotations

import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DEFAULTS: dict = {
    # WRF: glob for wrfout files. Files sharing SIMULATION_START_DATE are merged into one run.
    "wrf_glob": r"D:\HPC-backup\wrfout_d02_*",
    # AWS: one or more Excel workbooks in the wide (one column per day) format.
    "aws_files": [r"C:\Users\NESAC\OneDrive\Documents\Rainfall_Data_September_2026.xlsx"],
    "aws_sheet": 0,
    # Blank AWS cells are treated as MISSING (not zero) unless this is true.
    "aws_blank_is_zero": False,
    # GPM IMERG half-hourly files (HDF5 or nc4), searched recursively.
    "gpm_dir": r"D:\GPM\IMERG",
    "gpm_glob": "**/*3IMERG*",
    "gpm_variable": "",  # "" = auto (precipitation / precipitationCal)
    # Minimum fraction of the 48 half-hour files required to report a daily GPM total.
    "gpm_min_fraction": 1.0,
    # BFS GeoTIFFs, searched recursively; date is parsed from the filename.
    "bfs_dir": r"D:\BFS",
    "bfs_glob": "**/*.tif*",
    # Shift applied to the date parsed from BFS filenames so it equals the
    # *end date* of the 03 UTC -> 03 UTC window (same convention as the AWS sheet).
    # Use 1 if a file named 2026-09-23 holds rain for 23 Sep 03Z -> 24 Sep 03Z.
    "bfs_date_offset_days": 0,
    # Hour (UTC) at which the observational day ends (IMD: 03 UTC = 0830 IST).
    "day_end_hour_utc": 3,
    # How model/satellite grids are sampled at gauge locations: "nearest" or "bilinear".
    "station_sampling": "nearest",
    # Fallback crop box [lon_min, lon_max, lat_min, lat_max] if no WRF run is found.
    "bbox": [84.0, 101.0, 18.0, 34.0],
}

_LIST_KEYS = {"aws_files", "bbox"}


def _coerce(key: str, raw: str):
    default = DEFAULTS.get(key)
    if key in _LIST_KEYS:
        items = [s for s in raw.split(";") if s.strip()]
        return [float(s) for s in items] if key == "bbox" else items
    if isinstance(default, bool):
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(default, int):
        return int(raw)
    if isinstance(default, float):
        return float(raw)
    return raw


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    cfg_path = Path(os.environ.get("NERVAL_CONFIG", BASE_DIR / "config.json"))
    if cfg_path.exists():
        with open(cfg_path, "r", encoding="utf-8") as fh:
            user = json.load(fh)
        cfg.update({k: v for k, v in user.items() if not k.startswith("_")})
    for key in DEFAULTS:
        env = os.environ.get(f"NERVAL_{key.upper()}")
        if env is not None:
            cfg[key] = _coerce(key, env)
    if isinstance(cfg["aws_files"], str):
        cfg["aws_files"] = [cfg["aws_files"]]
    return cfg
