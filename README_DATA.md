# NER-Validation — running with real data

The dashboard no longer generates mock data. A small Python backend (`server/`) reads the
WRF, GPM IMERG, BFS and AWS files and serves them to the React app at `/api/...`.

## 1. One-time setup

```bat
cd server
pip install -r requirements.txt
```
(On Windows, if `netCDF4` / `rasterio` fail to build with pip, install them from conda-forge:
`conda install -c conda-forge netcdf4 h5py rasterio`.)

```bat
npm install
```

## 2. Point it at your data — `server/config.json`

| key | meaning |
|---|---|
| `wrf_glob` | wrfout files. Files with the same `SIMULATION_START_DATE` are merged into one run. |
| `aws_files` | one or more Excel sheets in the wide format (one column per date). |
| `gpm_dir`, `gpm_glob` | folder with IMERG half-hourly HDF5/nc4 files (**set this**). |
| `bfs_dir`, `bfs_glob` | folder with BFS GeoTIFFs; date is read from the file name (**set this**). |
| `bfs_date_offset_days` | 0 if a BFS file dated D is rain ending D 03 UTC; 1 if it starts D 03 UTC. |
| `aws_blank_is_zero` | `false`: blank cells are missing. `true`: blank = 0 mm. |
| `gpm_min_fraction` | fraction of the 48 half-hours needed to report a GPM day (1.0 = all). |
| `station_sampling` | `nearest` or `bilinear` when sampling grids at gauges. |

Any key can also be overridden with an env var `NERVAL_<KEY>`.

## 3. Run

Two terminals (or double-click the .bat files):

```bat
run_backend.bat      :: API on http://127.0.0.1:8000  (check http://127.0.0.1:8000/api/catalog)
run_frontend.bat     :: dashboard on http://localhost:3000
```

Alternatively `npm run build` once, then only `run_backend.bat` and open http://127.0.0.1:8000
(the backend serves the built `dist/` folder).

After adding new files, use **Data Sources → Reload** in the dashboard (or restart the backend).

## Conventions used

* **Daily window**: 03 UTC (D-1) → 03 UTC (D), labelled D (IMD 0830 IST convention).
  The AWS column date is taken as the window end date.
* **WRF Day-N**: the run whose window starts at lead 24(N-1)…24N h. A 48 h 00 UTC run gives
  Day-1 = 23 Sep 03Z → 24 Sep 03Z (lead 3–27 h). Day-2 would need ≥ 51 h of forecast.
* **WRF rain** = RAINC + RAINNC + RAINSH (bucket terms added if `BUCKET_MM > 0`).
* **GPM**: half-hourly `precipitation` (mm/h) × 0.5 h, summed over the 48 slots of the window.
* **BFS**: single-band numeric GeoTIFFs are used as rain values (map + statistics). RGB /
  paletted images can only be overlaid as a picture and are excluded from statistics.
* **Differences** (map "minus" mode) are computed on the grid of the second field
  (box-mean when coarsening, bilinear when refining).

## API (for scripts)

`/api/catalog`, `/api/stations`, `/api/validation?start=YYYY-MM-DD&end=YYYY-MM-DD&lead_day=1`,
`/api/field?source=wrf|gpm|bfs&date=YYYY-MM-DD&lead_day=1`,
`/api/diff?a=wrf&b=gpm&date=...`, `/api/station/{id}/hourly`, `/api/bfs/image?date=...`,
`POST /api/reload`.
