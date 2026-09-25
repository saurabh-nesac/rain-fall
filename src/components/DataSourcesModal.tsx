import React, { useState } from 'react';
import { X, Database, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Catalog } from '../types';

interface DataSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: Catalog;
  onReload: () => Promise<void> | void;
}

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 text-xs">
    <span className="text-slate-400 whitespace-nowrap">{label}</span>
    <span className="text-slate-200 font-mono text-right break-all">{value}</span>
  </div>
);

export const DataSourcesModal: React.FC<DataSourcesModalProps> = ({ isOpen, onClose, catalog, onReload }) => {
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;

  const src = catalog.sources;
  const span = (xs: string[]) => (xs.length ? `${xs[0]} → ${xs[xs.length - 1]} (${xs.length})` : 'none');
  const blocks = [
    {
      key: 'wrf',
      title: 'WRF (wrfout)',
      rows: [
        ['Pattern', src.wrf?.pattern],
        ['Runs', catalog.runs.map((r) => `${r.id} (+${r.forecastHours}h, ${r.nTimes} steps, ${r.files.length} file)`).join('; ') || 'none'],
        ['Verifiable dates', span(Object.keys(catalog.dates.wrf))],
      ],
    },
    {
      key: 'gpm',
      title: 'GPM IMERG half-hourly',
      rows: [
        ['Folder', `${src.gpm?.dir}  [${src.gpm?.pattern}]`],
        ['Files', catalog.counts.gpmFiles],
        ['Complete days', span(catalog.dates.gpm)],
      ],
    },
    {
      key: 'bfs',
      title: 'BFS GeoTIFF',
      rows: [
        ['Folder', `${src.bfs?.dir}  [${src.bfs?.pattern}]`],
        ['Dates', span(catalog.dates.bfs)],
        ['Content', catalog.bfsNumeric == null ? '—' : catalog.bfsNumeric ? 'rainfall values (used in stats)' : 'colour image (overlay only)'],
        ['Date offset (days)', src.bfs?.dateOffsetDays],
      ],
    },
    {
      key: 'aws',
      title: 'AWS / ARG Excel',
      rows: [
        ['Files', (src.aws?.files ?? []).join('; ')],
        ['Stations', `${catalog.counts.awsStationsReporting} reporting / ${catalog.counts.awsStations} listed`],
        ['Dates with data', span(catalog.dates.aws)],
        ['Blank cells', src.aws?.blankIsZero ? 'treated as 0 mm' : 'treated as missing'],
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Data sources</h2>
              <p className="text-xs text-slate-400">
                Scanned {catalog.loadedAt?.replace('T', ' ').slice(0, 19)} UTC • paths are set in server/config.json
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {blocks.map((b) => {
          const warns: string[] = src[b.key]?.warnings ?? [];
          return (
            <div key={b.key} className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">{b.title}</h3>
                {warns.length ? (
                  <span className="text-[10px] text-amber-300 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{warns.length} warning(s)</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 flex items-center space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>OK</span>
                  </span>
                )}
              </div>
              {b.rows.map(([k, v]) => (
                <Row key={String(k)} label={String(k)} value={v as React.ReactNode} />
              ))}
              {warns.length > 0 && (
                <ul className="text-[11px] text-amber-200/90 list-disc pl-5 space-y-0.5 pt-1">
                  {warns.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-end space-x-3 pt-1">
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await onReload();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition flex items-center space-x-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>Rescan folders</span>
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white text-xs font-bold rounded-xl">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
