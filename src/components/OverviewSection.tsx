import React, { useMemo } from 'react';
import { CloudRain, MapPin, BarChart3, ArrowRight, Cpu, Satellite, ShieldAlert, CalendarRange } from 'lucide-react';
import { Catalog, ContinuousMetrics, Station, TimeStepData, ValidationResponse } from '../types';
import { fmtMetric } from '../data/nerData';
import type { Period } from '../App';
import type { TabId } from './Navbar';

interface OverviewSectionProps {
  catalog: Catalog;
  period: Period;
  validation: ValidationResponse | null;
  stations: Station[];
  allTimelines: Record<string, TimeStepData[]>;
  overallMetricsWRF: ContinuousMetrics;
  overallMetricsBFS: ContinuousMetrics;
  overallMetricsGPM: ContinuousMetrics;
  onNavigateTab: (tab: TabId) => void;
  onSelectStation: (stationId: string) => void;
}

function describe(m: ContinuousMetrics, label: string): string {
  if (m.sampleCount === 0) return `No ${label}–AWS pairs in this period. Check date availability below.`;
  const dir = m.bias > 0 ? 'over-estimates' : m.bias < 0 ? 'under-estimates' : 'matches';
  const r = m.sampleCount >= 3 && Number.isFinite(m.correlation) ? `, r = ${m.correlation}` : '';
  return `${label} ${dir} gauge rain by ${Math.abs(m.bias)} mm/day on average over ${m.sampleCount} station-days${r}.`;
}

const MetricCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  tone: 'indigo' | 'emerald' | 'amber';
  m: ContinuousMetrics;
  note: string;
  cta: string;
  onClick: () => void;
}> = ({ title, icon, tone, m, note, cta, onClick }) => {
  const border = { indigo: 'border-indigo-500/30', emerald: 'border-emerald-500/30', amber: 'border-amber-500/30' }[tone];
  const text = { indigo: 'text-indigo-400', emerald: 'text-emerald-400', amber: 'text-amber-400' }[tone];
  const val = { indigo: 'text-indigo-300', emerald: 'text-emerald-300', amber: 'text-amber-300' }[tone];
  const btn = {
    indigo: 'bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300',
    emerald: 'bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300',
    amber: 'bg-amber-600/20 hover:bg-amber-600 text-amber-300',
  }[tone];
  return (
    <div className={`bg-slate-900 p-6 rounded-2xl border ${border} space-y-4 transition`}>
      <div className="flex items-center justify-between">
        <div className={`flex items-center space-x-2 ${text} font-bold text-sm`}>
          {icon}
          <span>{title}</span>
        </div>
        <span className="px-2 py-0.5 text-[10px] bg-slate-950 text-slate-300 font-mono rounded border border-slate-700">
          r = {fmtMetric(m.correlation, m.sampleCount, 3)} • n = {m.sampleCount}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 font-mono">
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 block font-sans">RMSE</span>
          <strong className={`text-lg ${val}`}>{fmtMetric(m.rmse, m.sampleCount, 1)} mm</strong>
        </div>
        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 block font-sans">Mean bias</span>
          <strong className={`text-lg ${m.bias >= 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
            {fmtMetric(m.bias, m.sampleCount, 1, true)} mm
          </strong>
        </div>
      </div>
      <p className="text-xs text-slate-400 min-h-[2.5rem]">{note}</p>
      <button
        onClick={onClick}
        className={`w-full py-2 ${btn} hover:text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2`}
      >
        <span>{cta}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  catalog,
  period,
  validation,
  stations,
  allTimelines,
  overallMetricsWRF,
  overallMetricsBFS,
  overallMetricsGPM,
  onNavigateTab,
  onSelectStation,
}) => {
  const hotspots = useMemo(() => {
    return stations
      .map((s) => {
        let best: { v: number; date: string } | null = null;
        (allTimelines[s.id] || []).forEach((d) => {
          if (d.rainAWS != null && (!best || d.rainAWS > best.v)) best = { v: d.rainAWS, date: d.date };
        });
        return { s, best: best as { v: number; date: string } | null };
      })
      .filter((x) => x.best && x.best.v > 0)
      .sort((a, b) => b.best!.v - a.best!.v)
      .slice(0, 5);
  }, [stations, allTimelines]);

  const reporting = useMemo(
    () => stations.filter((s) => (allTimelines[s.id] || []).some((d) => d.rainAWS != null)).length,
    [stations, allTimelines]
  );

  const avail = useMemo(() => {
    const days = validation?.dates ?? [];
    const a = validation?.availability ?? {};
    return {
      days: days.length,
      wrf: days.filter((d) => a[d]?.wrf).length,
      gpm: days.filter((d) => a[d]?.gpm).length,
      bfs: days.filter((d) => a[d]?.bfs).length,
      runs: Array.from(new Set(days.map((d) => a[d]?.wrfRun).filter(Boolean))) as string[],
    };
  }, [validation]);

  const maxObs = hotspots[0]?.best?.v;
  const h = String(catalog.dayEndHourUtc).padStart(2, '0');
  const bfsNote =
    catalog.bfsNumeric === false
      ? 'BFS TIFFs are colour images, so they are shown on the map only and excluded from statistics.'
      : describe(overallMetricsBFS, 'BFS');

  return (
    <div className="w-full space-y-6">
      {/* Period banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-full text-xs font-extrabold uppercase tracking-wider">
                WRF Day-{period.leadDay} verification
              </span>
              <span className="text-xs font-semibold text-slate-400">
                24 h windows {h} UTC → {h} UTC, labelled by end date
              </span>
            </div>
            {maxObs != null && (
              <div className="flex items-center space-x-2 text-xs font-mono text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/30">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>
                  Max gauge rainfall: <strong>{maxObs} mm/day</strong>
                </span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center space-x-3">
              <CalendarRange className="w-7 h-7 text-cyan-400" />
              <span>
                {period.start} → {period.end}
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              {reporting} of {stations.length} gauges reported at least one day in this period. Station values of WRF, GPM and
              BFS use {catalog.stationSampling === 'bilinear' ? 'bilinear interpolation' : 'the grid cell containing the gauge'}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="font-bold text-slate-400">Days with data ({avail.days} in period):</span>
            <span className="px-2.5 py-1 bg-slate-950 text-indigo-300 rounded-lg border border-slate-800 font-mono">WRF {avail.wrf}</span>
            <span className="px-2.5 py-1 bg-slate-950 text-amber-300 rounded-lg border border-slate-800 font-mono">GPM {avail.gpm}</span>
            <span className="px-2.5 py-1 bg-slate-950 text-emerald-300 rounded-lg border border-slate-800 font-mono">BFS {avail.bfs}</span>
            {avail.runs.length > 0 && (
              <span className="text-slate-500 font-mono">
                runs: {avail.runs.slice(0, 4).join(', ')}
                {avail.runs.length > 4 ? ` +${avail.runs.length - 4}` : ''}
              </span>
            )}
          </div>
          {avail.days > 0 && avail.wrf === 0 && (
            <p className="text-xs text-amber-300">
              No WRF Day-{period.leadDay} window falls inside this period. A run initialised at 00 UTC D covers the {h} UTC
              window ending D+1 as Day-1; Day-2 needs at least {24 + Number(catalog.dayEndHourUtc) + 24} forecast hours.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title={`WRF${catalog.runs[0] ? ` ${catalog.runs[0].dxKm} km` : ''} vs AWS`}
          icon={<Cpu className="w-5 h-5" />}
          tone="indigo"
          m={overallMetricsWRF}
          note={describe(overallMetricsWRF, 'WRF')}
          cta="View full WRF scores"
          onClick={() => onNavigateTab('metrics')}
        />
        <MetricCard
          title="BFS vs AWS"
          icon={<CloudRain className="w-5 h-5" />}
          tone="emerald"
          m={overallMetricsBFS}
          note={bfsNote}
          cta="Open map layers"
          onClick={() => onNavigateTab('map')}
        />
        <MetricCard
          title="GPM IMERG vs AWS"
          icon={<Satellite className="w-5 h-5" />}
          tone="amber"
          m={overallMetricsGPM}
          note={describe(overallMetricsGPM, 'GPM')}
          cta="Plot time series"
          onClick={() => onNavigateTab('timeseries')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-rose-400" />
              <span>Heaviest gauge rainfall in period</span>
            </h3>
            <button onClick={() => onNavigateTab('stations')} className="text-xs text-cyan-400 hover:underline font-bold">
              All stations &rarr;
            </button>
          </div>
          <div className="space-y-3">
            {hotspots.length === 0 && <p className="text-xs text-slate-500">No gauge rainfall recorded in this period.</p>}
            {hotspots.map(({ s, best }, idx) => (
              <div
                key={s.id}
                onClick={() => {
                  onSelectStation(s.id);
                  onNavigateTab('timeseries');
                }}
                className="p-3 bg-slate-950 rounded-xl border border-slate-800 hover:border-cyan-500/40 transition flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 font-mono font-bold text-xs flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <div>
                    <div className="font-bold text-slate-200 text-xs">{s.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {s.district}, {s.state} • {s.sensorType}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <strong className="text-sm font-mono text-rose-400 block">{best!.v} mm</strong>
                  <span className="text-[9px] text-slate-500">{best!.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 grid grid-cols-2 gap-4">
          <div
            onClick={() => onNavigateTab('map')}
            className="bg-slate-900 p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition cursor-pointer flex flex-col justify-between space-y-3 group"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-200 text-sm group-hover:text-cyan-400 transition">Spatial map</h4>
              <p className="text-xs text-slate-400 mt-1">Daily WRF / GPM / BFS rasters, bias fields and gauge values.</p>
            </div>
            <span className="text-xs font-bold text-cyan-400 flex items-center space-x-1">
              <span>Open map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
          <div
            onClick={() => onNavigateTab('metrics')}
            className="bg-slate-900 p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/50 transition cursor-pointer flex flex-col justify-between space-y-3 group"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-200 text-sm group-hover:text-indigo-400 transition">Statistical metrics</h4>
              <p className="text-xs text-slate-400 mt-1">RMSE, MAE, bias, contingency table, POD, FAR, ETS.</p>
            </div>
            <span className="text-xs font-bold text-indigo-400 flex items-center space-x-1">
              <span>View scores</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
