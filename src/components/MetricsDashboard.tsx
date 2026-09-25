import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { 
  BarChart3, 
  Target, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Sliders, 
  Info, 
  TrendingUp,
  Activity,
  Award
} from 'lucide-react';
import { Station, TimeStepData, DatasetSource } from '../types';
import { computeContinuousMetrics, computeCategoricalMetrics, completePairs, fmtMetric, NER_STATES } from '../data/nerData';

interface MetricsDashboardProps {
  stations: Station[];
  allTimelines: Record<string, TimeStepData[]>;
  selectedDataset: DatasetSource;
  onSelectDataset: (ds: DatasetSource) => void;
  leadDay: number;
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({
  stations,
  allTimelines,
  selectedDataset,
  onSelectDataset,
  leadDay,
}) => {
  const [thresholdMm, setThresholdMm] = useState<number>(15.6);
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('ALL');

  // Aggregate all observation-model pairs across all selected stations
  const pairedData = useMemo(() => {
    const pairs: { obs: number; model: number; stationName: string; date: string }[] = [];

    stations.forEach((stn) => {
      if (selectedStateFilter !== 'ALL' && stn.state !== selectedStateFilter) return;

      const timeline = allTimelines[stn.id] || [];
      timeline.forEach((step) => {
        let modelVal = step.rainWRF;
        if (selectedDataset === 'bfs') modelVal = step.rainBFS;
        else if (selectedDataset === 'gpm') modelVal = step.rainGPM;
        if (step.rainAWS == null || modelVal == null) return; // only complete station-days

        pairs.push({
          obs: step.rainAWS,
          model: modelVal,
          stationName: stn.name,
          date: step.date,
        });
      });
    });

    return pairs;
  }, [stations, allTimelines, selectedDataset, selectedStateFilter]);

  // Compute Continuous Verification Metrics
  const contMetrics = useMemo(() => {
    return computeContinuousMetrics(pairedData);
  }, [pairedData]);

  // Compute Categorical Verification Metrics
  const catMetrics = useMemo(() => {
    return computeCategoricalMetrics(pairedData, thresholdMm);
  }, [pairedData, thresholdMm]);

  // Sample scatter data (downsampled for clean render)
  const scatterData = useMemo(() => {
    return pairedData.map((p) => ({
      x: p.obs,
      y: p.model,
      name: `${p.stationName} ${p.date}`,
    }));
  }, [pairedData]);

  const n = contMetrics.sampleCount;
  const axisMax = Math.max(10, ...pairedData.map((p) => Math.max(p.obs, p.model)));
  const stateOptions = Array.from(new Set<string>(stations.map((s) => s.state))).sort(
    (a, b) => (NER_STATES.indexOf(a) + 1 || 99) - (NER_STATES.indexOf(b) + 1 || 99)
  );

  return (
    <div className="w-full space-y-6">
      
      {/* Top Banner & Dataset Selector */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Target className="w-6 h-6 text-cyan-400" />
            <span>Meteorological Verification & Performance Metrics</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            <strong className="text-cyan-400 uppercase">{selectedDataset}</strong>
            {selectedDataset === 'wrf' ? ` Day-${leadDay}` : ''} against AWS/ARG daily gauge rainfall • {pairedData.length} complete
            station-days (days where either value is missing are excluded).
          </p>
        </div>

        <select
          value={selectedStateFilter}
          onChange={(e) => setSelectedStateFilter(e.target.value)}
          className="bg-slate-950 text-xs text-slate-200 px-3 py-2 rounded-xl border border-slate-800 focus:outline-none"
        >
          <option value="ALL">All states</option>
          {stateOptions.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        {/* Dataset Switcher */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <span className="text-xs font-bold text-slate-400 uppercase px-2">Dataset under evaluation:</span>
          {(
            [
              { id: 'wrf', label: 'WRF' },
              { id: 'bfs', label: 'BFS' },
              { id: 'gpm', label: 'GPM IMERG' },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              onClick={() => onSelectDataset(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedDataset === d.id
                  ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Continuous Verification Scorecards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* RMSE Card */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">RMSE (Root Mean Sq)</span>
          <div className="text-2xl font-black text-cyan-400 font-mono mt-1">{fmtMetric(contMetrics.rmse, n, 1)} <span className="text-xs font-sans font-normal text-slate-400">mm</span></div>
          <span className="text-[10px] text-slate-500 mt-1 block">Lower is better</span>
        </div>

        {/* MAE Card */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">MAE (Mean Abs Error)</span>
          <div className="text-2xl font-black text-slate-200 font-mono mt-1">{fmtMetric(contMetrics.mae, n, 1)} <span className="text-xs font-sans font-normal text-slate-400">mm</span></div>
          <span className="text-[10px] text-slate-500 mt-1 block">Average magnitude</span>
        </div>

        {/* Mean Bias Card */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Systematic Bias</span>
          <div className={`text-2xl font-black font-mono mt-1 ${contMetrics.bias >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {fmtMetric(contMetrics.bias, n, 1, true)} <span className="text-xs font-sans font-normal text-slate-400">mm</span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            {n === 0 ? 'No pairs' : contMetrics.bias > 0 ? 'Over-estimating' : contMetrics.bias < 0 ? 'Under-estimating' : 'Unbiased'}
          </span>
        </div>

        {/* Pearson Correlation r Card */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">Correlation (r)</span>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">{fmtMetric(contMetrics.correlation, n, 3)}</div>
          <span className="text-[10px] text-slate-500 mt-1 block">Optimal: +1.0</span>
        </div>

        {/* Nash-Sutcliffe Efficiency Card */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">NSE Efficiency</span>
          <div className="text-2xl font-black text-indigo-400 font-mono mt-1">{fmtMetric(contMetrics.nse, n, 3)}</div>
          <span className="text-[10px] text-slate-500 mt-1 block">Optimal: 1.0</span>
        </div>

        {/* SD Ratio Card */}
        <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">SD Ratio (Model/Obs)</span>
          <div className="text-2xl font-black text-amber-400 font-mono mt-1">{fmtMetric(contMetrics.sdRatio, n, 3)}</div>
          <span className="text-[10px] text-slate-500 mt-1 block">Variance Match: 1.0</span>
        </div>

      </div>

      {/* Categorical Threshold Metrics & 2x2 Contingency Matrix Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Contingency Table & Scores (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <span>Categorical Verification & Contingency Matrix</span>
              </h3>
              <p className="text-xs text-slate-400">
                Evaluation of Rain/No-Rain and extreme intensity thresholds.
              </p>
            </div>

            {/* Threshold Selector Buttons */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {[
                { label: 'Rain (≥2.5mm)', val: 2.5 },
                { label: 'Mod (≥15.6mm)', val: 15.6 },
                { label: 'Heavy (≥64.5mm)', val: 64.5 },
                { label: 'V. Heavy (≥115.6mm)', val: 115.6 },
              ].map((t) => (
                <button
                  key={t.val}
                  onClick={() => setThresholdMm(t.val)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                    thresholdMm === t.val
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2x2 Contingency Matrix Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>2x2 Contingency Table (Threshold: &ge; {thresholdMm} mm)</span>
              <span className="text-slate-500">Hits + Misses + False Alarms + Correct Neg = {pairedData.length}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2 bg-slate-950 rounded text-slate-500 font-sans font-bold flex items-center justify-center">
                Observed \ Forecast
              </div>
              <div className="p-2 bg-slate-950 rounded text-cyan-400 font-bold">
                Forecast YES (&ge;{thresholdMm}mm)
              </div>
              <div className="p-2 bg-slate-950 rounded text-slate-400 font-bold">
                Forecast NO (&lt;{thresholdMm}mm)
              </div>

              <div className="p-2 bg-slate-950 rounded text-emerald-400 font-bold flex items-center justify-center font-sans">
                Observed YES
              </div>
              {/* Hits */}
              <div className="p-4 bg-emerald-950/40 rounded border border-emerald-500/40 text-emerald-300">
                <span className="text-[10px] uppercase font-sans text-emerald-400 block font-bold">Hits (a)</span>
                <strong className="text-2xl font-bold">{catMetrics.hits}</strong>
              </div>
              {/* Misses */}
              <div className="p-4 bg-rose-950/40 rounded border border-rose-500/40 text-rose-300">
                <span className="text-[10px] uppercase font-sans text-rose-400 block font-bold">Misses (c)</span>
                <strong className="text-2xl font-bold">{catMetrics.misses}</strong>
              </div>

              <div className="p-2 bg-slate-950 rounded text-slate-400 font-bold flex items-center justify-center font-sans">
                Observed NO
              </div>
              {/* False Alarms */}
              <div className="p-4 bg-amber-950/40 rounded border border-amber-500/40 text-amber-300">
                <span className="text-[10px] uppercase font-sans text-amber-400 block font-bold">False Alarms (b)</span>
                <strong className="text-2xl font-bold">{catMetrics.falseAlarms}</strong>
              </div>
              {/* Correct Negatives */}
              <div className="p-4 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span className="text-[10px] uppercase font-sans text-slate-500 block font-bold">Correct Negatives (d)</span>
                <strong className="text-2xl font-bold">{catMetrics.correctNegatives}</strong>
              </div>
            </div>
          </div>

          {/* Categorical Scores Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">POD (Detect Prob)</span>
              <strong className="text-lg font-mono text-emerald-400 block mt-0.5">{fmtMetric(catMetrics.pod, n, 1)}</strong>
              <span className="text-[9px] text-slate-500">Hits/(Hits+Miss)</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">FAR (False Alarm)</span>
              <strong className="text-lg font-mono text-rose-400 block mt-0.5">{fmtMetric(catMetrics.far, n, 1)}</strong>
              <span className="text-[9px] text-slate-500">FA/(Hits+FA)</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">TS / CSI (Threat)</span>
              <strong className="text-lg font-mono text-cyan-400 block mt-0.5">{fmtMetric(catMetrics.ts, n, 1)}</strong>
              <span className="text-[9px] text-slate-500">Threat Score</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">ETS (Equitable)</span>
              <strong className="text-lg font-mono text-indigo-400 block mt-0.5">{fmtMetric(catMetrics.ets, n, 1)}</strong>
              <span className="text-[9px] text-slate-500">Random Adjusted</span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">FBI (Freq Bias)</span>
              <strong className={`text-lg font-mono block mt-0.5 ${catMetrics.fbi > 1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {fmtMetric(catMetrics.fbi, n, 1)}
              </strong>
              <span className="text-[9px] text-slate-500">Optimal: 1.0</span>
            </div>

          </div>
        </div>

        {/* Model vs Observed Scatter Plot (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>Scatter & 1:1 Validation Plot</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparison of observed AWS rainfall (X-axis) vs {selectedDataset.toUpperCase()} model values (Y-axis).
            </p>
          </div>

          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" dataKey="x" name="AWS Obs" unit="mm" domain={[0, Math.ceil(axisMax)]} stroke="#94a3b8" fontSize={11} label={{ value: 'AWS Observed Rain (mm)', position: 'insideBottom', offset: -10, fill: '#64748b' }} />
                <YAxis type="number" dataKey="y" name="Model" unit="mm" domain={[0, Math.ceil(axisMax)]} stroke="#94a3b8" fontSize={11} label={{ value: `${selectedDataset.toUpperCase()} Rain (mm)`, angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc', fontSize: '11px' }} />
                
                {/* 1:1 Reference Line */}
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: axisMax, y: axisMax }]} stroke="#38bdf8" strokeDasharray="5 5" label={{ value: '1:1 Ideal Line', fill: '#38bdf8', fontSize: 10 }} />
                
                <Scatter name="Validation Points" data={scatterData} fill="#34d399" opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center space-x-2">
            <Info className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>Points above 1:1 line denote model overestimation; points below denote model underestimation.</span>
          </div>
        </div>

      </div>
    </div>
  );
};
