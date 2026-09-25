import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Download, 
  Globe, 
  ArrowUpDown, 
  CheckCircle2, 
  AlertTriangle, 
  MapPin, 
  Compass,
  ArrowRight
} from 'lucide-react';
import { Station, TimeStepData } from '../types';
import { computeContinuousMetrics, fmtMetric, NER_STATES } from '../data/nerData';

interface StationTableProps {
  stations: Station[];
  allTimelines: Record<string, TimeStepData[]>;
  selectedStationId: string;
  onSelectStation: (stationId: string) => void;
  onSwitchToTimeSeries: () => void;
}

export const StationTable: React.FC<StationTableProps> = ({
  stations,
  allTimelines,
  selectedStationId,
  onSelectStation,
  onSwitchToTimeSeries,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('ALL');
  const [sortField, setSortField] = useState<'name' | 'rmse' | 'bias' | 'correlation' | 'elevationMeters'>('rmse');
  const [sortAsc, setSortAsc] = useState(false);

  // Row-level statistics. Totals are sums over reported days; WRF scores use complete AWS/WRF pairs only.
  const stationRows = useMemo(() => {
    const sum = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 10) / 10 : null;
    };
    return stations.map((stn) => {
      const t = allTimelines[stn.id] || [];
      const m = computeContinuousMetrics(t.map((d) => ({ obs: d.rainAWS, model: d.rainWRF })));
      return {
        station: stn,
        awsDays: t.filter((d) => d.rainAWS != null).length,
        awsTotal: sum(t.map((d) => d.rainAWS)),
        wrfTotal: sum(t.map((d) => d.rainWRF)),
        bfsTotal: sum(t.map((d) => d.rainBFS)),
        gpmTotal: sum(t.map((d) => d.rainGPM)),
        n: m.sampleCount,
        rmse: m.sampleCount ? m.rmse : null,
        bias: m.sampleCount ? m.bias : null,
        correlation: m.sampleCount >= 3 && Number.isFinite(m.correlation) ? m.correlation : null,
      };
    });
  }, [stations, allTimelines]);

  // Filter & Sort
  const filteredRows = useMemo(() => {
    return stationRows
      .filter((row) => {
        const matchesSearch =
          row.station.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          row.station.district.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesState = selectedState === 'ALL' || row.station.state === selectedState;
        return matchesSearch && matchesState;
      })
      .sort((a, b) => {
        let valA: number | null = 0;
        let valB: number | null = 0;

        if (sortField === 'name') {
          return sortAsc
            ? a.station.name.localeCompare(b.station.name)
            : b.station.name.localeCompare(a.station.name);
        } else if (sortField === 'rmse') {
          valA = a.rmse;
          valB = b.rmse;
        } else if (sortField === 'bias') {
          valA = a.bias == null ? null : Math.abs(a.bias);
          valB = b.bias == null ? null : Math.abs(b.bias);
        } else if (sortField === 'correlation') {
          valA = a.correlation;
          valB = b.correlation;
        } else if (sortField === 'elevationMeters') {
          valA = a.station.elevationMeters;
          valB = b.station.elevationMeters;
        }

        // stations without a value always sort last
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [stationRows, searchTerm, selectedState, sortField, sortAsc]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers =
      'Station ID,Station Name,District,State,Type,Lat,Lon,Elevation (m),AWS days,AWS total (mm),WRF total (mm),BFS total (mm),GPM total (mm),WRF-AWS pairs,WRF RMSE (mm),WRF Bias (mm),WRF r\n';
    const c = (v: number | null | undefined) => (v == null ? '' : v);
    const rows = filteredRows
      .map(
        (r) =>
          `"${r.station.id}","${r.station.name}","${r.station.district}","${r.station.state}",${r.station.sensorType},${r.station.lat},${r.station.lng},${c(
            r.station.elevationMeters
          )},${r.awsDays},${c(r.awsTotal)},${c(r.wrfTotal)},${c(r.bfsTotal)},${c(r.gpmTotal)},${r.n},${c(r.rmse)},${c(r.bias)},${c(r.correlation)}`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NER_station_verification.csv`;
    URL.revokeObjectURL(url);
    a.click();
  };

  return (
    <div className="w-full bg-slate-900 rounded-2xl p-6 border border-slate-800 space-y-6">
      
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <Compass className="w-6 h-6 text-cyan-400" />
            <span>AWS Ground Station Verification Registry</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Station-wise WRF verification against daily gauge rainfall ({filteredRows.length} stations shown). Totals are sums
            over reported days, so compare them only where the day counts match.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search station or district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 text-xs text-slate-200 pl-9 pr-4 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-500/50 w-52 sm:w-64"
            />
          </div>

          {/* State Filter */}
          <div className="flex items-center space-x-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
            <Globe className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">
                All states
              </option>
              {NER_STATES.map((st) => (
                <option key={st} value={st} className="bg-slate-900 text-slate-200">
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Export Button */}
          <button
            onClick={exportToCSV}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center space-x-2"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>CSV Export</span>
          </button>
        </div>
      </div>

      {/* Main Station Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Station / Location</th>
              <th className="py-3 px-4 cursor-pointer hover:text-slate-200" onClick={() => handleSort('elevationMeters')}>
                <div className="flex items-center space-x-1">
                  <span>Elevation</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 text-center">AWS Rain (days)</th>
              <th className="py-3 px-4 text-center">WRF Rain</th>
              <th className="py-3 px-4 text-center">BFS Rain</th>
              <th className="py-3 px-4 text-center">GPM Rain</th>
              <th className="py-3 px-4 cursor-pointer text-center hover:text-slate-200" onClick={() => handleSort('rmse')}>
                <div className="flex items-center justify-center space-x-1">
                  <span>WRF RMSE</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer text-center hover:text-slate-200" onClick={() => handleSort('bias')}>
                <div className="flex items-center justify-center space-x-1">
                  <span>WRF Bias</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 cursor-pointer text-center hover:text-slate-200" onClick={() => handleSort('correlation')}>
                <div className="flex items-center justify-center space-x-1">
                  <span>WRF Corr (r)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-500" />
                </div>
              </th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {filteredRows.map((r) => {
              const isSelected = r.station.id === selectedStationId;

              return (
                <tr
                  key={r.station.id}
                  className={`hover:bg-slate-800/50 transition cursor-pointer ${
                    isSelected ? 'bg-cyan-500/10 border-l-4 border-l-cyan-400' : ''
                  }`}
                  onClick={() => onSelectStation(r.station.id)}
                >
                  {/* Station Name & District */}
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-200 flex items-center space-x-2">
                      <MapPin className={`w-3.5 h-3.5 ${isSelected ? 'text-cyan-400' : 'text-slate-500'}`} />
                      <span>{r.station.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 ml-5">
                      {r.station.district}, {r.station.state} • {r.station.sensorType}
                    </div>
                  </td>

                  {/* Elevation */}
                  <td className="py-3 px-4 text-slate-300 font-mono">
                    {r.station.elevationMeters != null ? `${r.station.elevationMeters} m` : '—'}
                  </td>

                  {/* Total AWS Rain */}
                  <td className="py-3 px-4 text-center font-mono font-bold text-rose-400">
                    {r.awsTotal ?? '—'} {r.awsTotal != null && 'mm'}
                    <span className="block text-[10px] text-slate-500 font-normal">{r.awsDays} d</span>
                  </td>

                  {/* WRF Rain */}
                  <td className="py-3 px-4 text-center font-mono font-bold text-indigo-400">
                    {r.wrfTotal != null ? `${r.wrfTotal} mm` : '—'}
                  </td>

                  {/* BFS Rain */}
                  <td className="py-3 px-4 text-center font-mono text-emerald-400">
                    {r.bfsTotal != null ? `${r.bfsTotal} mm` : '—'}
                  </td>

                  {/* GPM Rain */}
                  <td className="py-3 px-4 text-center font-mono text-amber-400">
                    {r.gpmTotal != null ? `${r.gpmTotal} mm` : '—'}
                  </td>

                  {/* RMSE */}
                  <td className="py-3 px-4 text-center font-mono font-bold text-cyan-300">
                    {r.rmse != null ? `${r.rmse} mm` : '—'}
                    <span className="block text-[10px] text-slate-500 font-normal">n={r.n}</span>
                  </td>

                  {/* Bias */}
                  <td className="py-3 px-4 text-center font-mono">
                    {r.bias == null ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.bias > 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'
                        }`}
                      >
                        {fmtMetric(r.bias, r.n, 1, true)} mm
                      </span>
                    )}
                  </td>

                  {/* Correlation */}
                  <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                    {r.correlation ?? '—'}
                  </td>

                  {/* Action Button */}
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStation(r.station.id);
                        onSwitchToTimeSeries();
                      }}
                      className="px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded text-[11px] font-bold transition flex items-center space-x-1 ml-auto"
                    >
                      <span>Plot</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
