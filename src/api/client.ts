import { Catalog, GridSource, HourlyRow, RasterField, Station, ValidationResponse } from '../types';

// Empty base = same origin. In dev, vite proxies /api to the FastAPI server.
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'Backend not reachable. Start it with: cd server && uvicorn app:app --port 8000');
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.detail || msg;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const q = (params: Record<string, string | number>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

export const api = {
  catalog: () => request<Catalog>('/api/catalog'),
  reload: () => request<Catalog>('/api/reload', { method: 'POST' }),
  stations: () => request<Station[]>('/api/stations'),
  validation: (start: string, end: string, leadDay: number) =>
    request<ValidationResponse>(`/api/validation?${q({ start, end, lead_day: leadDay })}`),
  field: (source: GridSource, date: string, leadDay: number) =>
    request<RasterField>(`/api/field?${q({ source, date, lead_day: leadDay })}`),
  diff: (a: GridSource, b: GridSource, date: string, leadDay: number) =>
    request<RasterField>(`/api/diff?${q({ a, b, date, lead_day: leadDay })}`),
  bfsMeta: (date: string) =>
    request<{ numeric: boolean; bounds: [number, number, number, number] | null; file: string }>(
      `/api/bfs/meta?${q({ date })}`
    ),
  bfsImageUrl: (date: string) => `${BASE}/api/bfs/image?${q({ date })}`,
  stationHourly: (stationId: string, run: string) =>
    request<{ station: string; run: string; stepHours: number; rows: HourlyRow[] }>(
      `/api/station/${encodeURIComponent(stationId)}/hourly?${q({ run })}`
    ),
};
