"""BFS GeoTIFF reader.

Two kinds of TIFF are handled:
  * single-band numeric rasters (rainfall in mm)  -> a Field, used for map + statistics
  * 3/4-band 8-bit images (already colour-rendered) -> overlay picture only; no numbers,
    so BFS is then excluded from station statistics.
The date is parsed from the file name (see config 'bfs_date_offset_days').
"""
from __future__ import annotations

import glob
import io
import logging
import os
import re
from collections import OrderedDict
from datetime import date, datetime, timedelta
from typing import Optional

import numpy as np

from grids import Field, mercator_row_map

log = logging.getLogger("bfs")

_DATE_PATTERNS = [
    (re.compile(r"(?<!\d)(20\d{2})[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01])(?!\d)"), ("y", "m", "d")),
    (re.compile(r"(?<!\d)(0[1-9]|[12]\d|3[01])[-_.]?(0[1-9]|1[0-2])[-_.]?(20\d{2})(?!\d)"), ("d", "m", "y")),
]


def parse_date(name: str) -> Optional[date]:
    for rx, order in _DATE_PATTERNS:
        m = rx.search(name)
        if m:
            parts = dict(zip(order, m.groups()))
            try:
                return date(int(parts["y"]), int(parts["m"]), int(parts["d"]))
            except ValueError:
                continue
    return None


class BfsStore:
    def __init__(self, directory: str, pattern: str, offset_days: int = 0):
        self.directory = directory
        self.pattern = pattern
        self.offset_days = offset_days
        self.files: dict[str, str] = {}  # window-end date iso -> path
        self.warnings: list[str] = []
        self._cache: "OrderedDict[str, dict]" = OrderedDict()

    def scan(self) -> None:
        self.files.clear()
        self.warnings.clear()
        self._cache.clear()
        if not os.path.isdir(self.directory):
            self.warnings.append(f"BFS directory not found: {self.directory}")
            return
        for p in sorted(glob.glob(os.path.join(self.directory, self.pattern), recursive=True)):
            if not os.path.isfile(p):
                continue
            d = parse_date(os.path.basename(p))
            if d is None:
                self.warnings.append(f"{os.path.basename(p)}: no date in file name, skipped")
                continue
            key = (d + timedelta(days=self.offset_days)).isoformat()
            if key in self.files:
                self.warnings.append(f"Two BFS files for {key}; using {os.path.basename(p)}")
            self.files[key] = p
        log.info("BFS: %d file(s)", len(self.files))

    # ------------------------------------------------------------------ io
    def _load(self, day: str) -> Optional[dict]:
        if day in self._cache:
            self._cache.move_to_end(day)
            return self._cache[day]
        path = self.files.get(day)
        if not path:
            return None
        import rasterio
        from rasterio.warp import Resampling, calculate_default_transform, reproject

        from rasterio.enums import ColorInterp

        with rasterio.open(path) as src:
            count, dtype = src.count, src.dtypes[0]
            crs = src.crs
            transform = src.transform
            nodata = src.nodata
            palette = count == 1 and src.colorinterp[0] == ColorInterp.palette
            if palette:
                # colour-mapped image: expand to RGBA, it carries no rainfall numbers
                idx = src.read(1)
                cmap = src.colormap(1)
                lut = np.zeros((256, 4), dtype=np.uint8)
                for k, rgba in cmap.items():
                    if 0 <= k < 256:
                        lut[k] = rgba
                if nodata is not None and 0 <= int(nodata) < 256:
                    lut[int(nodata), 3] = 0
                data = np.moveaxis(lut[idx], -1, 0)
                count = 4
            else:
                data = src.read().astype(np.float32 if count == 1 else np.uint8)
            if crs is not None and not crs.is_geographic:
                dst_t, w, h = calculate_default_transform(crs, "EPSG:4326", src.width, src.height, *src.bounds)
                out = np.zeros((count, h, w), dtype=data.dtype)
                reproject(data, out, src_transform=transform, src_crs=crs, dst_transform=dst_t,
                          dst_crs="EPSG:4326",
                          resampling=Resampling.nearest, src_nodata=nodata if count == 1 else None,
                          dst_nodata=np.nan if count == 1 else 0)
                data, transform = out, dst_t
            elif crs is None:
                self.warnings.append(f"{os.path.basename(path)}: no CRS; assuming EPSG:4326")
        if transform.b != 0 or transform.d != 0:
            raise ValueError("rotated GeoTIFFs are not supported")
        h, w = data.shape[1], data.shape[2]
        west, north = transform.c, transform.f
        dx, dy = transform.a, transform.e  # dy < 0 for north-up
        lon_edges = west + dx * np.arange(w + 1)
        lat_edges = north + dy * np.arange(h + 1)
        numeric = count == 1
        entry: dict = {"path": path, "numeric": numeric}
        if numeric:
            band = data[0].astype(np.float32)
            if nodata is not None:
                band[np.isclose(band, nodata)] = np.nan
            band[(band < 0) | (band > 2000)] = np.nan  # physically implausible daily totals
            lats = 0.5 * (lat_edges[1:] + lat_edges[:-1])
            lons = 0.5 * (lon_edges[1:] + lon_edges[:-1])
            entry["field"] = Field(lats, lons, band, lat_edges, lon_edges,
                                   {"source": "bfs", "units": "mm", "file": os.path.basename(path)})
        else:
            rgb = np.moveaxis(data[:4], 0, -1)
            if rgb.shape[-1] == 3:
                alpha = np.where(rgb.sum(axis=-1) == 0, 0, 255).astype(np.uint8)
                rgb = np.concatenate([rgb, alpha[..., None]], axis=-1)
            if dy > 0:  # south-up image
                rgb = rgb[::-1]
                lat_edges = lat_edges[::-1]
            rows = mercator_row_map(lat_edges, out_rows=rgb.shape[0])
            from PIL import Image

            buf = io.BytesIO()
            Image.fromarray(rgb[rows], "RGBA").save(buf, format="PNG", optimize=True)
            entry["png"] = buf.getvalue()
            entry["bounds"] = [float(lat_edges[-1]), float(lon_edges[0]), float(lat_edges[0]), float(lon_edges[-1])]
        self._cache[day] = entry
        while len(self._cache) > 40:
            self._cache.popitem(last=False)
        return entry

    def field(self, day: str) -> Optional[Field]:
        e = self._load(day)
        return e.get("field") if e else None

    def image(self, day: str) -> Optional[dict]:
        e = self._load(day)
        if not e:
            return None
        return {"numeric": e["numeric"], "bounds": e.get("bounds"), "png": e.get("png"),
                "file": os.path.basename(e["path"])}
