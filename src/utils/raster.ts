import { RasterField } from '../types';
import { RGBA } from './palette';

const mercY = (lat: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
};
const invMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

/** Index of the cell containing x on ascending edges, or -1. */
export function findCell(edges: number[], x: number): number {
  if (x < edges[0] || x >= edges[edges.length - 1]) return -1;
  let lo = 0;
  let hi = edges.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function valueAt(field: RasterField, lat: number, lng: number): number | null {
  const i = findCell(field.latEdges, lat);
  const j = findCell(field.lonEdges, lng);
  if (i < 0 || j < 0) return null;
  return field.values[i * field.nlon + j];
}

/**
 * Paint a rectilinear lat/lon field into a PNG whose rows are regular in Web-Mercator y,
 * which is how Leaflet stretches an imageOverlay. Lat-regular grids (GPM/BFS) and
 * Mercator-native grids (WRF) therefore both land exactly where they belong.
 */
export function fieldToDataURL(
  field: RasterField,
  color: (v: number) => RGBA | null,
  opts: { threshold?: number; isDiff?: boolean } = {}
): { url: string; bounds: [[number, number], [number, number]] } {
  const { nlat, nlon, latEdges, lonEdges, values } = field;
  const south = latEdges[0];
  const north = latEdges[nlat];
  const west = lonEdges[0];
  const east = lonEdges[nlon];
  const W = Math.min(nlon * 2, 2048);
  const H = Math.min(nlat * 2, 2048);

  const colIdx = new Int32Array(W);
  for (let c = 0; c < W; c++) colIdx[c] = findCell(lonEdges, west + ((c + 0.5) / W) * (east - west));
  const yTop = mercY(north);
  const yBot = mercY(south);
  const rowIdx = new Int32Array(H);
  for (let r = 0; r < H; r++) rowIdx[r] = findCell(latEdges, invMercY(yTop + ((r + 0.5) / H) * (yBot - yTop)));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const thr = opts.threshold ?? 0;
  for (let r = 0; r < H; r++) {
    const i = rowIdx[r];
    if (i < 0) continue;
    for (let c = 0; c < W; c++) {
      const j = colIdx[c];
      if (j < 0) continue;
      const v = values[i * nlon + j];
      if (v == null) continue;
      if (!opts.isDiff && v < thr) continue;
      const rgba = color(v);
      if (!rgba) continue;
      const o = (r * W + c) * 4;
      px[o] = rgba[0];
      px[o + 1] = rgba[1];
      px[o + 2] = rgba[2];
      px[o + 3] = rgba[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL('image/png'), bounds: [[south, west], [north, east]] };
}
