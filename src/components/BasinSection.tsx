import React, { useState, useMemo } from 'react';
import { 
  Waves, 
  ShieldAlert, 
  BarChart3, 
  MapPin, 
  TrendingUp, 
  AlertTriangle, 
  Layers, 
  CheckCircle2, 
  ArrowRight,
  Droplets,
  Gauge
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { Station, BasinMetrics } from '../types';
import { RIVER_BASINS } from '../data/nerData';
import type { TabId } from './Navbar';

interface BasinSectionProps {
  basinMetrics: BasinMetrics[];
  stations: Station[];
  onSelectBasinOnMap: (basinId: string) => void;
  onSelectStation: (stationId: string) => void;
  onNavigateTab: (tab: TabId) => void;
}

export const BasinSection: React.FC<BasinSectionProps> = ({
  basinMetrics,
  stations,
  onSelectBasinOnMap,
  onSelectStation,
  onNavigateTab,
}) => {
  const [selectedParentSystem, setSelectedParentSystem] = useState<string>('ALL');
  const [activeBasinId, setActiveBasinId] = useState<string>(RIVER_BASINS[0].id);

  // Filtered basins
  const filteredBasins = useMemo(() => {
    if (selectedParentSystem === 'ALL') return basinMetrics;
    return basinMetrics.filter((b) => b.parentSystem === selectedParentSystem);
  }, [basinMetrics, selectedParentSystem]);

  // Selected Basin details
  const activeBasinInfo = useMemo(() => {
    return RIVER_BASINS.find((b) => b.id === activeBasinId) || RIVER_BASINS[0];
  }, [activeBasinId]);

  const activeBasinMetric = useMemo(() => {
    return basinMetrics.find((b) => b.basinId === activeBasinId) || basinMetrics[0];
  }, [basinMetrics, activeBasinId]);

  // Contained stations
  const activeBasinStations = useMemo(() => {
    return stations.filter((s) => s.basinId === activeBasinId);
  }, [stations, activeBasinId]);

  // Recharts Chart Data
  const chartData = useMemo(() => {
    return filteredBasins.map((b) => ({
      name: b.basinName.replace(' Basin', '').replace(' River', ''),
      AWS: b.meanRainAWS,
      WRF: b.meanRainWRF,
      BFS: b.meanRainBFS,
      GPM: b.meanRainGPM,
      Bias: b.wrfBias,
      VolMCM: b.accumulatedVolumeMCM,
    }));
  }, [filteredBasins]);

  // Summary Counters
  const severeCount = useMemo(() => {
    return basinMetrics.filter((b) => b.floodRiskLevel === 'Severe' || b.floodRiskLevel === 'High').length;
  }, [basinMetrics]);

  const totalVolumeMCM = useMemo(() => {
    return Math.round(basinMetrics.reduce((acc, curr) => acc + (curr.accumulatedVolumeMCM ?? 0), 0));
  }, [basinMetrics]);

  return (
    <div className="w-full space-y-6">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 p-6 sm:p-8 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="px-3 py-1 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center space-x-1.5">
                <Waves className="w-3.5 h-3.5" />
                <span>NER River Basin Hydrology</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {basinMetrics.length} basins • station means (not areal averages)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
              Basin-Wise Precipitation & Forecast Verification
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Mean daily rainfall over the gauges that fall inside each (approximate) basin outline, with WRF, BFS and GPM sampled at
              the same gauges. Basin outlines are coarse placeholders, and thresholds are indicative only.
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800 font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block font-sans">Mean daily rain volume</span>
              <strong className="text-xl text-cyan-400">{totalVolumeMCM.toLocaleString()} MCM</strong>
            </div>
            <div className="w-px h-8 bg-slate-800"></div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase block font-sans">Basins ≥ threshold</span>
              <strong className="text-xl text-rose-400">{severeCount} Basins</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs by River System */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400 mr-2">Filter Parent System:</span>
          {['ALL', 'Brahmaputra', 'Barak-Surma', 'Teesta', 'Chindwin', 'Tripura-Coastal'].map((sys) => (
            <button
              key={sys}
              onClick={() => setSelectedParentSystem(sys)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedParentSystem === sys
                  ? 'bg-cyan-500 text-slate-950 font-extrabold shadow-md'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {sys}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing <strong>{filteredBasins.length}</strong> river catchments
        </div>
      </div>

      {/* Recharts Bar Comparison Chart */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              <span>Basin gauge-mean rainfall (mm/day)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Mean of all available station-days per dataset. Basins without reporting gauges are blank.
            </p>
          </div>

          <div className="flex items-center space-x-4 text-xs font-mono">
            <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-sm bg-rose-500"></span><span className="text-slate-300">AWS Gauge</span></span>
            <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500"></span><span className="text-slate-300">WRF</span></span>
            <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500"></span><span className="text-slate-300">BFS</span></span>
            <span className="flex items-center space-x-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500"></span><span className="text-slate-300">GPM IMERG</span></span>
          </div>
        </div>

        <div className="h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-15} textAnchor="end" />
              <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: 'Rainfall (mm)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                formatter={(value: any) => (value == null ? '—' : `${value} mm`)}
              />
              <Bar dataKey="AWS" fill="#f43f5e" radius={[4, 4, 0, 0]} name="AWS Gauge" />
              <Bar dataKey="WRF" fill="#6366f1" radius={[4, 4, 0, 0]} name="WRF" />
              <Bar dataKey="BFS" fill="#10b981" radius={[4, 4, 0, 0]} name="BFS" />
              <Bar dataKey="GPM" fill="#f59e0b" radius={[4, 4, 0, 0]} name="GPM" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Grid of Basin Scorecards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBasins.map((b) => {
          const isSelected = b.basinId === activeBasinId;
          const basinInfo = RIVER_BASINS.find((r) => r.id === b.basinId)!;

          let riskBg = 'bg-slate-950 border-slate-800';
          let riskBadge = 'bg-slate-800 text-slate-300';
          if (b.floodRiskLevel === 'Severe') {
            riskBg = 'bg-slate-900 border-rose-500/50 shadow-lg shadow-rose-950/20';
            riskBadge = 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
          } else if (b.floodRiskLevel === 'High') {
            riskBg = 'bg-slate-900 border-amber-500/50';
            riskBadge = 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
          } else if (b.floodRiskLevel === 'Moderate') {
            riskBg = 'bg-slate-900 border-cyan-500/30';
            riskBadge = 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30';
          }

          return (
            <div
              key={b.basinId}
              onClick={() => setActiveBasinId(b.basinId)}
              className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between space-y-4 ${riskBg} ${
                isSelected ? 'ring-2 ring-cyan-400 border-transparent bg-slate-900' : 'hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-slate-950 text-slate-400 rounded border border-slate-800">
                    {b.parentSystem}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${riskBadge}`}>
                    {b.floodRiskLevel === 'No data' ? 'No gauge data' : `${b.floodRiskLevel} risk`}
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-bold text-slate-100">{b.basinName}</h4>
                  <p className="text-xs text-slate-400">
                    Area: <strong className="text-slate-200">{basinInfo.areaSqKm.toLocaleString()} sq km</strong> • States: {basinInfo.states.join(', ')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-sans">Mean AWS Rain</span>
                  <strong className="text-slate-100 text-sm">{b.meanRainAWS != null ? `${b.meanRainAWS} mm/day` : '—'}</strong>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-sans">WRF mean</span>
                  <strong className="text-indigo-400 text-sm">{b.meanRainWRF != null ? `${b.meanRainWRF} mm` : '—'}</strong>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-sans">WRF Model Bias</span>
                  <strong className={`text-sm ${(b.wrfBias ?? 0) >= 0 ? 'text-amber-400' : 'text-cyan-400'}`}>
                    {b.wrfBias == null ? '—' : `${b.wrfBias > 0 ? '+' : ''}${b.wrfBias} mm`}
                  </strong>
                  <span className="text-[9px] text-slate-500 block font-sans">n = {b.pairedSamples}</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block font-sans">Rain volume / day</span>
                  <strong className="text-cyan-400 text-sm">{b.accumulatedVolumeMCM != null ? `${b.accumulatedVolumeMCM} MCM` : '—'}</strong>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
                <span className="text-slate-400 flex items-center space-x-1">
                  <Gauge className="w-3.5 h-3.5 text-slate-400" />
                  <span>{b.stationCount} gauges in outline</span>
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectBasinOnMap(b.basinId);
                    onNavigateTab('map');
                  }}
                  className="text-cyan-400 font-bold hover:underline flex items-center space-x-1"
                >
                  <span>Locate on Map</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Basin Deep-Dive Detail View */}
      {activeBasinInfo && activeBasinMetric && (
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 bg-cyan-500/10 text-cyan-400 text-xs font-mono font-bold rounded border border-cyan-500/30">
                  {activeBasinInfo.code}
                </span>
                <span className="text-xs text-slate-400 uppercase font-mono">
                  Parent System: {activeBasinInfo.parentSystem}
                </span>
              </div>
              <h3 className="text-xl font-extrabold text-slate-100 mt-1">
                {activeBasinInfo.name} — Detailed Catchment Analysis
              </h3>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => {
                  onSelectBasinOnMap(activeBasinId);
                  onNavigateTab('map');
                }}
                className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition flex items-center space-x-2 shadow-lg"
              >
                <MapPin className="w-4 h-4" />
                <span>View Spatial Boundary on Map</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">Flood Alert Threshold</span>
              <div className="text-lg font-mono font-bold text-rose-400">{activeBasinInfo.floodThresholdMm} mm/day</div>
              <p className="text-[10px] text-slate-500">Critical rainfall for bank overflow trigger.</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">WRF RMSE (station-days)</span>
              <div className="text-lg font-mono font-bold text-indigo-400">{activeBasinMetric.wrfRmse != null ? `${activeBasinMetric.wrfRmse} mm` : '—'}</div>
              <p className="text-[10px] text-slate-500">Areal root mean square error.</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">Pearson Correlation (r)</span>
              <div className="text-lg font-mono font-bold text-emerald-400">{activeBasinMetric.correlation ?? '—'}</div>
              <p className="text-[10px] text-slate-500">WRF vs gauge, needs ≥ 3 pairs.</p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">Rain volume / day</span>
              <div className="text-lg font-mono font-bold text-cyan-400">
                {activeBasinMetric.accumulatedVolumeMCM != null ? `${activeBasinMetric.accumulatedVolumeMCM} MCM` : '—'}
              </div>
              <p className="text-[10px] text-slate-500">Basin area × gauge-mean daily rain (not runoff).</p>
            </div>
          </div>

          {/* Contained AWS Stations Table */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-slate-200 flex items-center space-x-2">
              <MapPin className="w-4 h-4 text-rose-400" />
              <span>Contained Ground AWS Stations in {activeBasinInfo.name} ({activeBasinStations.length})</span>
            </h4>

            {activeBasinStations.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 uppercase font-mono text-[10px] text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Station ID & Name</th>
                      <th className="py-3 px-4">State & District</th>
                      <th className="py-3 px-4">Lat / Lng</th>
                      <th className="py-3 px-4">Elevation</th>
                      <th className="py-3 px-4">Sensor Type</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {activeBasinStations.map((stn) => (
                      <tr key={stn.id} className="hover:bg-slate-900/50 transition">
                        <td className="py-3 px-4 font-bold text-slate-100 flex items-center space-x-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span>{stn.name}</span>
                        </td>
                        <td className="py-3 px-4 font-sans text-slate-300">{stn.state} ({stn.district})</td>
                        <td className="py-3 px-4">{stn.lat}°N, {stn.lng}°E</td>
                        <td className="py-3 px-4 text-amber-300">{stn.elevationMeters != null ? `${stn.elevationMeters} m` : '—'}</td>
                        <td className="py-3 px-4 font-sans text-slate-400">{stn.sensorType}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              onSelectStation(stn.id);
                              onNavigateTab('timeseries');
                            }}
                            className="px-2.5 py-1 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 rounded font-sans text-xs font-bold transition"
                          >
                            Plot Time-Series &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400">
                No gauges from the AWS sheet fall inside this basin outline.
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
