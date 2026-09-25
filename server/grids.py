"""Rectilinear lat/lon grid helpers shared by WRF, GPM and BFS readers.

Every gridded product is normalised to a `Field`: 1-D ascending latitude and
longitude cell centres plus a 2-D float32 array shaped (nlat, nlon), NaN = no data.
WRF on a Mercator projection is rectilinear in lat/lon (latitude depends only on
the row), so it fits this model exactly without any interpolation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np


def edges_from_centers(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64)
    if c.size == 1:
        return np.array([c[0] - 0.05, c[0] + 0.05])
    mid = 0.5 * (c[1:] + c[:-1])
    return np.concatenate([[c[0] - (mid[0] - c[0])], mid, [c[-1] + (c[-1] - mid[-1])]])


@dataclass
class Field:
    lats: np.ndarray  # (nlat,) ascending cell centres
    lons: np.ndarray  # (nlon,) ascending cell centres
    values: np.ndarray  # (nlat, nlon) float32, NaN = missing
    lat_edges: Optional[np.ndarray] = None  # (nlat+1,)
    lon_edges: Optional[np.ndarray] = None  # (nlon+1,)
    meta: dict = field(default_factory=dict)

    def __post_init__(self):
        self.lats = np.asarray(self.lats, dtype=np.float64)
        self.lons = np.asarray(self.lons, dtype=np.float64)
        self.values = np.asarray(self.values, dtype=np.float32)
        if self.lats[0] > self.lats[-1]:
            self.lats = self.lats[::-1]
            self.values = self.values[::-1, :]
            if self.lat_edges is not None:
                self.lat_edges = np.asarray(self.lat_edges)[::-1]
        if self.lons[0] > self.lons[-1]:
            self.lons = self.lons[::-1]
            self.values = self.values[:, ::-1]
            if self.lon_edges is not None:
                self.lon_edges = np.asarray(self.lon_edges)[::-1]
        if self.lat_edges is None:
            self.lat_edges = edges_from_centers(self.lats)
        if self.lon_edges is None:
            self.lon_edges = edges_from_centers(self.lons)
        self.lat_edges = np.asarray(self.lat_edges, dtype=np.float64)
        self.lon_edges = np.asarray(self.lon_edges, dtype=np.float64)
        if self.values.shape != (self.lats.size, self.lons.size):
            raise ValueError(f"values shape {self.values.shape} != ({self.lats.size}, {self.lons.size})")

    @property
    def bounds(self) -> list[float]:
        """[south, west, north, east] outer cell edges."""
        return [float(self.lat_edges[0]), float(self.lon_edges[0]),
                float(self.lat_edges[-1]), float(self.lon_edges[-1])]

    def with_values(self, values: np.ndarray, **meta) -> "Field":
        m = dict(self.meta)
        m.update(meta)
        return Field(self.lats.copy(), self.lons.copy(), values, self.lat_edges.copy(), self.lon_edges.copy(), m)


# ---------------------------------------------------------------- sampling

def _frac_index(axis: np.ndarray, x: np.ndarray) -> np.ndarray:
    """Fractional index of x on an ascending axis; NaN outside the axis range."""
    idx = np.interp(x, axis, np.arange(axis.size, dtype=np.float64), left=np.nan, right=np.nan)
    return idx


def sample_nearest(f: Field, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat = np.atleast_1d(np.asarray(lat, dtype=np.float64))
    lon = np.atleast_1d(np.asarray(lon, dtype=np.float64))
    i = np.searchsorted(f.lat_edges, lat, side="right") - 1
    j = np.searchsorted(f.lon_edges, lon, side="right") - 1
    ok = (i >= 0) & (i < f.lats.size) & (j >= 0) & (j < f.lons.size)
    out = np.full(lat.shape, np.nan, dtype=np.float32)
    out[ok] = f.values[i[ok], j[ok]]
    return out


def _bilinear_weights(f: Field, lat: np.ndarray, lon: np.ndarray):
    fi = _frac_index(f.lats, lat)
    fj = _frac_index(f.lons, lon)
    ok = ~(np.isnan(fi) | np.isnan(fj))
    fi = np.where(ok, fi, 0.0)
    fj = np.where(ok, fj, 0.0)
    i0 = np.clip(np.floor(fi).astype(int), 0, max(f.lats.size - 2, 0))
    j0 = np.clip(np.floor(fj).astype(int), 0, max(f.lons.size - 2, 0))
    i1 = np.minimum(i0 + 1, f.lats.size - 1)
    j1 = np.minimum(j0 + 1, f.lons.size - 1)
    wi = fi - i0
    wj = fj - j0
    return ok, i0, i1, j0, j1, wi, wj


def bilinear_from_arrays(values: np.ndarray, weights) -> np.ndarray:
    """Apply precomputed bilinear weights. `values` may have leading dims (..., nlat, nlon)."""
    ok, i0, i1, j0, j1, wi, wj = weights
    v00 = values[..., i0, j0]
    v01 = values[..., i0, j1]
    v10 = values[..., i1, j0]
    v11 = values[..., i1, j1]
    out = (v00 * (1 - wi) * (1 - wj) + v01 * (1 - wi) * wj + v10 * wi * (1 - wj) + v11 * wi * wj)
    out = np.where(ok, out, np.nan)
    return out.astype(np.float32)


def sample_bilinear(f: Field, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    lat = np.atleast_1d(np.asarray(lat, dtype=np.float64))
    lon = np.atleast_1d(np.asarray(lon, dtype=np.float64))
    w = _bilinear_weights(f, lat, lon)
    out = bilinear_from_arrays(f.values, w)
    # A point that lies in a valid cell but next to a NaN neighbour: fall back to nearest.
    nn = sample_nearest(f, lat, lon)
    return np.where(np.isnan(out) & w[0], nn, out).astype(np.float32)


def sample(f: Field, lat, lon, method: str = "nearest") -> np.ndarray:
    return sample_bilinear(f, lat, lon) if method == "bilinear" else sample_nearest(f, lat, lon)


def regrid_bilinear(src: Field, target: Field) -> Field:
    """Interpolate `src` onto `target`'s cell centres (separable bilinear)."""
    tlat, tlon = np.meshgrid(target.lats, target.lons, indexing="ij")
    w = _bilinear_weights(src, tlat.ravel(), tlon.ravel())
    vals = bilinear_from_arrays(src.values, w).reshape(tlat.shape)
    return target.with_values(vals)


def regrid_box_mean(src: Field, target: Field) -> Field:
    """Area-average finer `src` cells into coarser `target` cells (centre-in-box)."""
    ii = np.searchsorted(target.lat_edges, src.lats, side="right") - 1
    jj = np.searchsorted(target.lon_edges, src.lons, side="right") - 1
    I, J = np.meshgrid(ii, jj, indexing="ij")
    ok = (I >= 0) & (I < target.lats.size) & (J >= 0) & (J < target.lons.size) & ~np.isnan(src.values)
    flat = I[ok] * target.lons.size + J[ok]
    n = target.lats.size * target.lons.size
    s = np.bincount(flat, weights=src.values[ok].astype(np.float64), minlength=n)
    c = np.bincount(flat, minlength=n)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(c > 0, s / np.maximum(c, 1), np.nan)
    return target.with_values(mean.reshape(target.lats.size, target.lons.size))


def regrid(src: Field, target: Field) -> Field:
    """Box-average when source is finer than target, bilinear otherwise."""
    src_res = float(np.median(np.diff(src.lons))) if src.lons.size > 1 else 1.0
    tgt_res = float(np.median(np.diff(target.lons))) if target.lons.size > 1 else 1.0
    if src_res < 0.75 * tgt_res:
        out = regrid_box_mean(src, target)
        # fill target cells that received no source centre (thin edges) bilinearly
        hole = np.isnan(out.values)
        if hole.any():
            bl = regrid_bilinear(src, target).values
            out.values[hole] = bl[hole]
        return out
    return regrid_bilinear(src, target)


def crop(f: Field, south: float, west: float, north: float, east: float, pad: int = 1) -> Field:
    i0 = max(int(np.searchsorted(f.lats, south)) - pad, 0)
    i1 = min(int(np.searchsorted(f.lats, north)) + pad, f.lats.size)
    j0 = max(int(np.searchsorted(f.lons, west)) - pad, 0)
    j1 = min(int(np.searchsorted(f.lons, east)) + pad, f.lons.size)
    return Field(f.lats[i0:i1], f.lons[j0:j1], f.values[i0:i1, j0:j1],
                 f.lat_edges[i0:i1 + 1], f.lon_edges[j0:j1 + 1], dict(f.meta))


def regular_from_curvilinear(lat2d: np.ndarray, lon2d: np.ndarray, step: float):
    """Nearest-neighbour index map from a curvilinear grid to a regular lat/lon grid.

    Returns (lats, lons, flat_index, valid_mask). Used only if a WRF domain is not
    rectilinear (e.g. Lambert conformal); Mercator/lat-lon domains skip this.
    """
    from scipy.spatial import cKDTree

    lats = np.arange(np.nanmin(lat2d), np.nanmax(lat2d) + step / 2, step)
    lons = np.arange(np.nanmin(lon2d), np.nanmax(lon2d) + step / 2, step)
    tree = cKDTree(np.column_stack([lat2d.ravel(), lon2d.ravel() * np.cos(np.deg2rad(lat2d.ravel()))]))
    TL, TO = np.meshgrid(lats, lons, indexing="ij")
    d, idx = tree.query(np.column_stack([TL.ravel(), TO.ravel() * np.cos(np.deg2rad(TL.ravel()))]))
    valid = (d < 1.5 * step).reshape(TL.shape)
    return lats, lons, idx.reshape(TL.shape), valid


# ---------------------------------------------------------------- serialisation

def field_to_json(f: Field, decimals: int = 2) -> dict:
    v = np.round(f.values.astype(np.float64), decimals)
    flat = v.ravel()
    mask = np.isnan(flat)
    values = flat.astype(object)
    values[mask] = None
    return {
        "nlat": int(f.lats.size),
        "nlon": int(f.lons.size),
        "latEdges": np.round(f.lat_edges, 5).tolist(),
        "lonEdges": np.round(f.lon_edges, 5).tolist(),
        "values": values.tolist(),  # row-major, row 0 = southernmost
        "bounds": f.bounds,
        "stats": field_stats(f),
        "meta": f.meta,
    }


def field_stats(f: Field) -> dict:
    v = f.values[~np.isnan(f.values)]
    if v.size == 0:
        return {"min": None, "max": None, "mean": None, "validCells": 0}
    return {"min": round(float(v.min()), 2), "max": round(float(v.max()), 2),
            "mean": round(float(v.mean()), 2), "validCells": int(v.size)}


# ---------------------------------------------------------------- web-mercator helpers

def _merc_y(lat_deg: np.ndarray) -> np.ndarray:
    lat = np.deg2rad(np.clip(lat_deg, -85.0, 85.0))
    return np.log(np.tan(np.pi / 4 + lat / 2))


def _inv_merc_y(y: np.ndarray) -> np.ndarray:
    return np.rad2deg(2 * np.arctan(np.exp(y)) - np.pi / 2)


def mercator_row_map(lat_edges_desc_top: np.ndarray, out_rows: int) -> np.ndarray:
    """For an image whose rows are regular in latitude (north first), return, for each
    output row that is regular in Web-Mercator y, the source row index to use.
    Leaflet stretches overlays linearly in Mercator space, so lat-regular rasters
    must be resampled this way to land in the right place."""
    north, south = float(lat_edges_desc_top[0]), float(lat_edges_desc_top[-1])
    ytop, ybot = _merc_y(np.array(north)), _merc_y(np.array(south))
    yc = ytop + (np.arange(out_rows) + 0.5) / out_rows * (ybot - ytop)
    lat = _inv_merc_y(yc)
    nrows = lat_edges_desc_top.size - 1
    # rows regular in latitude from north to south
    frac = (north - lat) / (north - south) * nrows
    return np.clip(np.floor(frac).astype(int), 0, nrows - 1)
