import React from 'react';
import { 
  BarChart3, 
  Map, 
  Layers, 
  Download, 
  Info, 
  CloudRain, 
  Activity, 
  Globe, 
  Compass,
  Calendar,
  Database,
  Waves
} from 'lucide-react';
import { NER_STATES } from '../data/nerData';
import { Catalog } from '../types';
import type { Period } from '../App';

export type TabId = 'overview' | 'map' | 'timeseries' | 'metrics' | 'stations' | 'basins';

interface NavbarProps {
  catalog: Catalog;
  period: Period;
  onChangePeriod: (p: Period) => void;
  selectedState: string;
  onSelectState: (state: string) => void;
  activeTab: TabId;
  onChangeTab: (tab: TabId) => void;
  onOpenInfo: () => void;
  onExportReport: () => void;
  onOpenSources: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  catalog,
  period,
  onChangePeriod,
  selectedState,
  onSelectState,
  activeTab,
  onChangeTab,
  onOpenInfo,
  onExportReport,
  onOpenSources,
}) => {
  // lead days that exist anywhere in the WRF archive
  const leadDays = Array.from(new Set<number>((Object.values(catalog.dates.wrf) as number[][]).flat())).sort((a, b) => a - b);
  const leadOptions = leadDays.length ? leadDays : [1];
  const allDates = [...Object.keys(catalog.dates.wrf), ...catalog.dates.aws].sort();
  const minDate = allDates[0];
  const maxDate = allDates[allDates.length - 1];

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3 min-w-max">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black text-xl">
              <CloudRain className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
                  NER MET-VAL
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  WRF • GPM • BFS • AWS
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium hidden sm:block">
                North-East India WRF rainfall verification against GPM, BFS and AWS
              </p>
            </div>
          </div>

          {/* Quick Selectors: Event & State Filter */}
          <div className="hidden lg:flex items-center space-x-3 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80">
            {/* Validation period + forecast lead day */}
            <div className="flex items-center space-x-2 px-2 border-r border-slate-800">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <input
                type="date"
                value={period.start}
                min={minDate}
                max={period.end}
                onChange={(e) => e.target.value && onChangePeriod({ ...period, start: e.target.value })}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none [color-scheme:dark]"
                aria-label="Validation period start (window end date)"
              />
              <span className="text-slate-500 text-xs">→</span>
              <input
                type="date"
                value={period.end}
                min={period.start}
                max={maxDate}
                onChange={(e) => e.target.value && onChangePeriod({ ...period, end: e.target.value })}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none [color-scheme:dark]"
                aria-label="Validation period end (window end date)"
              />
              <select
                value={period.leadDay}
                onChange={(e) => onChangePeriod({ ...period, leadDay: parseInt(e.target.value, 10) })}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer"
                aria-label="WRF forecast lead day"
                title="WRF forecast day used for each date (Day-1 = lead 03-27 h for a 00 UTC run)"
              >
                {leadOptions.map((d) => (
                  <option key={d} value={d} className="bg-slate-900 text-slate-200">
                    WRF Day-{d}
                  </option>
                ))}
              </select>
            </div>
            {/* State Filter */}
            <div className="flex items-center space-x-2 px-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <select
                value={selectedState}
                onChange={(e) => onSelectState(e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer"
                aria-label="Filter by North-East State"
              >
                <option value="ALL" className="bg-slate-900 text-slate-200">
                  All 8 NER States
                </option>
                {NER_STATES.map((st) => (
                  <option key={st} value={st} className="bg-slate-900 text-slate-200">
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions: Info, Custom Upload, Export */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenSources}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition flex items-center space-x-1.5"
              title="Data sources, file paths and loader warnings"
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Data Sources</span>
            </button>

            <button
              onClick={onExportReport}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition flex items-center space-x-1.5"
              title="Export Full Performance Report"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Report</span>
            </button>

            <button
              onClick={onOpenInfo}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="About Model Validation Methodology & Datasets"
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-1 pb-2 overflow-x-auto no-scrollbar">
          <nav className="flex space-x-1 sm:space-x-2">
            <button
              onClick={() => onChangeTab('overview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                activeTab === 'overview'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => onChangeTab('map')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                activeTab === 'map'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              <span>Spatial Map Layers</span>
            </button>

            <button
              onClick={() => onChangeTab('basins')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                activeTab === 'basins'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Waves className="w-3.5 h-3.5 text-cyan-400" />
              <span>River Basins & Hydrology</span>
            </button>

            <button
              onClick={() => onChangeTab('timeseries')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                activeTab === 'timeseries'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Time-Series Plotting</span>
            </button>

            <button
              onClick={() => onChangeTab('metrics')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                activeTab === 'metrics'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Statistical Error Metrics</span>
            </button>

            <button
              onClick={() => onChangeTab('stations')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition ${
                activeTab === 'stations'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>AWS Station Evaluation</span>
            </button>
          </nav>

          <div className="hidden md:flex items-center space-x-2 text-[10px] font-mono text-slate-500">
            <span>
              {catalog.counts.wrfRuns} WRF run(s) • {catalog.counts.gpmFiles} GPM files • {catalog.counts.bfsFiles} BFS •{' '}
              {catalog.counts.awsStationsReporting}/{catalog.counts.awsStations} gauges reporting
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
