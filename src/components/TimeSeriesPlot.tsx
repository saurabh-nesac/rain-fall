import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Compass, Loader2 } from 'lucide-react';
import { HourlyRow, Station, TimeStepData, WrfRunInfo, MetricPair } from '../types';
import { computeContinuousMetrics, fmtMetric } from '../data/nerData';
import { api } from '../api/client';

interface TimeSeriesPlotProps {
  station: Station;
  timelineData: TimeStepData[];
  allStations: Station[];
  onSelectStation: (stationId: string) => void;
  runs: WrfRunInfo[];
  dayEndHourUtc: number;
}

type PlotType = 'daily' | 'accumulated' | 'hourly' | 'diurnal';

const SERIES = [
  { key: 'rainAWS', name: 'AWS gauge', color: '#f43f5e' },
  { key: 'rainWRF', name: 'WRF', color: '#818cf8' },
  { key: 'rainBFS', name: 'BFS', color: '#34d399' },
  { key: 'rainGPM', name: 'GPM IMERG', color: '#fbbf24' },
] as const;
type SeriesKey = (typeof SERIES)[number]['key'];

export const TimeSeriesPlot: React.FC<TimeSeriesPlotProps> = ({
  station,
  timelineData,
  allStations,
  onSelectStation,
  runs,
  dayEndHourUtc,
}) => {
  const [plotType, setPlotType] = useState<PlotType>('daily');
  const [shown, setShown] = useState<Record<SeriesKey, boolean>>({ rainAWS: true, rainWRF: true, rainBFS: true, rainGPM: true });
  const [runId, setRunId] = useState<string>(runs[runs.length - 1]?.id ?? '');
  const [hourly, setHourly] = useState<HourlyRow[] | null>(null);
  const [hourlyErr, setHourlyErr] = useState<string | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);

  const needsHourly = plotType === 'hourly' || plotType === 'diurnal';

  useEffect(() => {
    if (!needsHourly || !runId) return;
    let cancelled = false;
    setHourlyLoading(true);
    setHourlyErr(null);
    api
      .stationHourly(station.id, runId)
      .then((r) => !cancelled && setHourly(r.rows))
      .catch((e) => !cancelled && setHourlyErr(e.message))
      .finally(() => !cancelled && setHourlyLoading(false));
    return () => {
      cancelled = true;
    };
  }, [needsHourly, runId, station.id]);

  const available = useMemo(() => {
    const a = {} as Record<SeriesKey, boolean>;
    SERIES.forEach((s) => (a[s.key] = timelineData.some((d) => d[s.key] != null)));
    return a;
  }, [timelineData]);

  // Accumulate only over days where every shown+available series has a value, so totals are comparable.
  const accumulated = useMemo(() => {
    const keys = SERIES.map((s) => s.key).filter((k) => shown[k] && available[k]);
    const acc: Record<string, number> = {};
    keys.forEach((k) => (acc[k] = 0));
    let used = 0;
    const rows = timelineData.map((d) => {
      const complete = keys.every((k) => d[k] != null);
      if (complete) {
        used++;
        keys.forEach((k) => (acc[k] += d[k] as number));
      }
      const row: any = { date: d.date };
      keys.forEach((k) => (row[k] = Math.round(acc[k] * 10) / 10));
      return row;
    });
    return { rows, used, keys };
  }, [timelineData, shown, available]);

  const diurnal = useMemo(() => {
    if (!hourly) return [];
    const g: Record<number, { n: number; wrf: number; nw: number; gpm: number; ng: number }> = {};
    hourly.forEach((r) => {
      const t = new Date(r.time);
      const ist = (t.getUTCHours() + t.getUTCMinutes() / 60 + 5.5 + 24) % 24;
      const k = Math.floor(ist);
      g[k] ??= { n: 0, wrf: 0, nw: 0, gpm: 0, ng: 0 };
      if (r.wrf != null) {
        g[k].wrf += r.wrf;
        g[k].nw++;
      }
      if (r.gpm != null) {
        g[k].gpm += r.gpm;
        g[k].ng++;
      }
    });
    return Array.from({ length: 24 }, (_, h) => {
      const x = g[h];
      return {
        label: `${String(h).padStart(2, '0')}:30`,
        wrf: x && x.nw ? Math.round((x.wrf / x.nw) * 100) / 100 : null,
        gpm: x && x.ng ? Math.round((x.gpm / x.ng) * 100) / 100 : null,
      };
    });
  }, [hourly]);

  const hourlyRows = useMemo(
    () =>
      (hourly ?? []).map((r) => ({
        ...r,
        label: `+${r.leadHour}h`,
      })),
    [hourly]
  );

  const stationMetrics = useMemo(() => {
    const pairs = (k: SeriesKey): MetricPair[] => timelineData.map((d) => ({ obs: d.rainAWS, model: d[k] }));
    return {
      wrf: computeContinuousMetrics(pairs('rainWRF')),
      bfs: computeContinuousMetrics(pairs('rainBFS')),
      gpm: computeContinuousMetrics(pairs('rainGPM')),
    };
  }, [timelineData]);

  const hourlyTotals = useMemo(() => {
    let w = 0;
    let g = 0;
    let n = 0;
    (hourly ?? []).forEach((r) => {
      if (r.wrf != null && r.gpm != null) {
        w += r.wrf;
        g += r.gpm;
        n++;
      }
    });
    return { w: Math.round(w * 10) / 10, g: Math.round(g * 10) / 10, n };
  }, [hourly]);

  const h = String(dayEndHourUtc).padStart(2, '0');
  const tooltipStyle = { backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc', fontSize: '12px' };
  const fmtVal = (v: any) => (v == null ? '—' : `${v} mm`);

  return (
    <div className="w-full bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-800 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <h2 className="text-lg font-bold text-slate-100 flex items-center space-x-2">
              <span>Station time series:</span>
              <span className="text-cyan-400">{station.name}</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {station.district}, {station.state} • {station.sensorType}
            {station.elevationMeters != null ? ` • ${station.elevationMeters} m` : ''} • {station.lat}°N, {station.lng}°E
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <Compass className="w-4 h-4 text-cyan-400" />
            <select
              value={station.id}
              onChange={(e) => onSelectStation(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer max-w-[16rem]"
            >
              {allStations.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                  {s.name} ({s.district}){s.daysReported ? '' : ' – no reports'}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(
              [
                { id: 'daily', label: 'Daily' },
                { id: 'accumulated', label: 'Accumulated' },
                { id: 'hourly', label: 'Hourly (WRF vs GPM)' },
                { id: 'diurnal', label: 'Diurnal cycle' },
              ] as const
            ).map((pt) => (
              <button
                key={pt.id}
                onClick={() => setPlotType(pt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  plotType === pt.id ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>

          {needsHourly && (
            <select
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="bg-slate-950 text-xs text-slate-200 px-3 py-1.5 rounded-xl border border-slate-800 focus:outline-none"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  Run {r.init.slice(0, 13).replace('T', ' ')}Z (+{r.forecastHours}h)
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!needsHourly && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Datasets:</span>
            {SERIES.map((s) => (
              <button
                key={s.key}
                onClick={() => setShown({ ...shown, [s.key]: !shown[s.key] })}
                disabled={!available[s.key]}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition ${
                  !available[s.key]
                    ? 'text-slate-600 border-slate-800 cursor-not-allowed'
                    : shown[s.key]
                    ? 'text-slate-100 border-slate-600 font-bold'
                    : 'text-slate-500 border-slate-800 line-through'
                }`}
                title={available[s.key] ? '' : 'No data for this station in the period'}
              >
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}></span>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <div className="text-[11px] text-slate-400">
            {plotType === 'daily'
              ? `24 h totals, ${h} UTC → ${h} UTC, labelled by end date`
              : `Cumulative over ${accumulated.used} day(s) where all shown datasets have values`}
          </div>
        </div>
      )}

      <div className="w-full h-80 sm:h-96 pt-2">
        {needsHourly && hourlyLoading && (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm space-x-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading hourly WRF and GPM at this gauge…</span>
          </div>
        )}
        {needsHourly && hourlyErr && <div className="text-rose-300 text-sm">{hourlyErr}</div>}
        {needsHourly && !runs.length && <div className="text-slate-400 text-sm">No WRF runs found.</div>}

        {plotType === 'daily' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" mm" />
              <Tooltip contentStyle={tooltipStyle} formatter={fmtVal} />
              <Legend verticalAlign="top" height={36} />
              {SERIES.filter((s) => shown[s.key] && available[s.key]).map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {plotType === 'accumulated' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={accumulated.rows} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" mm" />
              <Tooltip contentStyle={tooltipStyle} formatter={fmtVal} />
              <Legend verticalAlign="top" height={36} />
              {SERIES.filter((s) => accumulated.keys.includes(s.key)).map((s) => (
                <Line key={s.key} type="stepAfter" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.5} dot={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {plotType === 'hourly' && hourly && !hourlyLoading && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={hourlyRows} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="label" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} interval={5} />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" mm" />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={fmtVal}
                labelFormatter={(_, p: any) => (p?.[0]?.payload?.time ? p[0].payload.time.replace('T', ' ').replace(':00Z', ' UTC') : '')}
              />
              <Legend verticalAlign="top" height={36} />
              <Bar dataKey="gpm" name="GPM IMERG (hourly)" fill="#fbbf24" opacity={0.8} />
              <Line type="monotone" dataKey="wrf" name="WRF (hourly)" stroke="#818cf8" strokeWidth={2.5} dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {plotType === 'diurnal' && hourly && !hourlyLoading && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={diurnal} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                label={{ value: 'Hour ending (IST)', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 11 }}
              />
              <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 11 }} unit=" mm" />
              <Tooltip contentStyle={tooltipStyle} formatter={fmtVal} />
              <Legend verticalAlign="top" height={36} />
              <Line type="monotone" dataKey="gpm" name="GPM mean" stroke="#fbbf24" strokeWidth={2.5} dot />
              <Line type="monotone" dataKey="wrf" name="WRF mean" stroke="#818cf8" strokeWidth={2.5} dot />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {needsHourly ? (
        <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800">
          AWS data are daily, so hourly views compare WRF with GPM only. Over {hourlyTotals.n} hours where both exist: WRF{' '}
          <strong className="text-indigo-300">{hourlyTotals.w} mm</strong>, GPM <strong className="text-amber-300">{hourlyTotals.g} mm</strong>.
          {plotType === 'diurnal' && ' A single 48 h run gives at most two samples per hour; the cycle becomes meaningful across many runs.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
          {(
            [
              { k: 'wrf', label: 'WRF vs AWS', box: 'border-indigo-500/30', title: 'text-indigo-400' },
              { k: 'bfs', label: 'BFS vs AWS', box: 'border-emerald-500/30', title: 'text-emerald-400' },
              { k: 'gpm', label: 'GPM vs AWS', box: 'border-amber-500/30', title: 'text-amber-400' },
            ] as const
          ).map(({ k, label, box, title }) => {
            const m = stationMetrics[k];
            return (
              <div key={k} className={`bg-slate-950 p-4 rounded-xl border ${box} space-y-2`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${title} uppercase`}>{label}</span>
                  <span className="px-2 py-0.5 text-[10px] bg-slate-900 text-slate-300 rounded border border-slate-700 font-mono">
                    n = {m.sampleCount} • r = {fmtMetric(m.correlation, m.sampleCount, 3)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1 font-mono">
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">RMSE</span>
                    <strong className="text-xs text-slate-200">{fmtMetric(m.rmse, m.sampleCount, 1)} mm</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">Bias</span>
                    <strong className={`text-xs ${m.bias >= 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                      {fmtMetric(m.bias, m.sampleCount, 1, true)} mm
                    </strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-[10px] text-slate-400 block">NSE</span>
                    <strong className="text-xs text-slate-200">{fmtMetric(m.nse, m.sampleCount, 3)}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
