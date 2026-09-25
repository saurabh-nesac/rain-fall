import React from 'react';
import { X, CloudRain, Cpu, Satellite, Radio, BookOpen, Target } from 'lucide-react';
import { Catalog } from '../types';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: Catalog;
}

// WRF namelist option codes -> scheme names (subset relevant here)
const MP: Record<number, string> = { 1: 'Kessler', 2: 'Purdue Lin', 3: 'WSM3', 4: 'WSM5', 6: 'WSM6', 8: 'Thompson', 10: 'Morrison 2-mom', 16: 'WDM6', 28: 'Thompson aerosol-aware' };
const CU: Record<number, string> = { 0: 'none (explicit)', 1: 'Kain-Fritsch', 2: 'Betts-Miller-Janjic', 3: 'Grell-Freitas', 5: 'Grell-3D', 11: 'Multi-scale KF', 16: 'New Tiedtke' };
const PBL: Record<number, string> = { 1: 'YSU', 2: 'MYJ', 5: 'MYNN2.5', 7: 'ACM2', 8: 'BouLac' };
const LSM: Record<number, string> = { 1: '5-layer thermal', 2: 'Noah', 3: 'RUC', 4: 'Noah-MP', 5: 'CLM4' };
const name = (m: Record<number, string>, v?: number) => (v == null ? '?' : m[v] ? `${m[v]} (${v})` : `option ${v}`);

export const InfoModal: React.FC<InfoModalProps> = ({ isOpen, onClose, catalog }) => {
  if (!isOpen) return null;
  const run = catalog.runs[catalog.runs.length - 1];
  const ph = run?.physics ?? {};
  const h = String(catalog.dayEndHourUtc).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Verification Methodology & Dataset Guide</h2>
              <p className="text-xs text-slate-400">North-East Region (NER) India Meteorological Model Validation Framework</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Datasets Explained Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* WRF Model */}
          <div className="bg-slate-950 p-4 rounded-xl border border-indigo-500/30 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-sm">
              <Cpu className="w-4 h-4" />
              <span>WRF {run ? `d${String(run.gridId).padStart(2, '0')} • ${run.dxKm} km • ${run.projection}` : '(no runs found)'}</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {run?.title || 'WRF-ARW'}. Microphysics {name(MP, ph.MP_PHYSICS)}, cumulus {name(CU, ph.CU_PHYSICS)}, PBL{' '}
              {name(PBL, ph.BL_PBL_PHYSICS)}, land surface {name(LSM, ph.SF_SURFACE_PHYSICS)}. Daily totals are
              RAINC + RAINNC + RAINSH differenced between the window's start and end output times.
            </p>
          </div>

          {/* BFS IMD Data */}
          <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
              <CloudRain className="w-4 h-4" />
              <span>BFS IMD Blended Grid</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Daily GeoTIFF read from the BFS folder; the date comes from the file name.{' '}
              {catalog.bfsNumeric === false
                ? 'These files are colour-rendered images, so they are shown as a map overlay only and are not used in statistics.'
                : 'Single-band values are treated as 24 h rainfall in mm and sampled at the gauges like the other grids.'}
            </p>
          </div>

          {/* GPM Satellite */}
          <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-2">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
              <Satellite className="w-4 h-4" />
              <span>GPM IMERG Satellite</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              NASA/JAXA IMERG half-hourly precipitation rate (mm/h) on a 0.1° grid. Each file contributes rate × 0.5 h; a day is
              the sum of the 48 files inside the window and is only reported when all 48 are present.
            </p>
          </div>

          {/* AWS Ground Truth */}
          <div className="bg-slate-950 p-4 rounded-xl border border-rose-500/30 space-y-2">
            <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
              <Radio className="w-4 h-4" />
              <span>AWS Ground Stations</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Daily AWS/ARG rainfall from the Excel sheet, reported at {h} UTC. The value in a date column is taken as the
              {h} UTC → {h} UTC total ending on that date. Blank cells are missing, not zero. This is the reference for all scores.
            </p>
          </div>

        </div>

        {/* Verification Metrics Explained */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-cyan-400 flex items-center space-x-2">
            <Target className="w-4 h-4" />
            <span>Statistical Verification Formulas</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-slate-900 p-3 rounded">
              <span className="text-slate-400 block font-sans font-bold mb-1">RMSE (Root Mean Square Error)</span>
              <code className="text-cyan-300 text-[11px]">sqrt( (1/N) * sum( (Model - Obs)^2 ) )</code>
            </div>
            <div className="bg-slate-900 p-3 rounded">
              <span className="text-slate-400 block font-sans font-bold mb-1">Mean Systematic Bias</span>
              <code className="text-cyan-300 text-[11px]">(1/N) * sum( Model - Obs )</code>
            </div>
            <div className="bg-slate-900 p-3 rounded">
              <span className="text-slate-400 block font-sans font-bold mb-1">POD (Probability of Detection)</span>
              <code className="text-emerald-300 text-[11px]">Hits / (Hits + Misses)</code>
            </div>
            <div className="bg-slate-900 p-3 rounded">
              <span className="text-slate-400 block font-sans font-bold mb-1">FAR (False Alarm Ratio)</span>
              <code className="text-rose-300 text-[11px]">FalseAlarms / (Hits + FalseAlarms)</code>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
          <div className="font-bold text-cyan-400">Matching rules</div>
          <p>
            Every dataset is reduced to 24 h totals for the window {h} UTC (D−1) → {h} UTC (D), labelled D. WRF Day-N uses the
            run in which that window starts between 24(N−1) and 24N hours after initialisation. Grids are sampled at gauges using{' '}
            {catalog.stationSampling === 'bilinear' ? 'bilinear interpolation' : 'the grid cell containing the gauge'}. Scores use
            only station-days where both the gauge and the compared dataset have a value. Bias maps put the layer on the reference
            grid (box-average when the layer is finer, bilinear otherwise).
          </p>
        </div>

        {/* Footer */}
        <div className="pt-2 text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-cyan-600/30"
          >
            Close Guide
          </button>
        </div>

      </div>
    </div>
  );
};
