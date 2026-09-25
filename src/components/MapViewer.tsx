import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Layers, Columns, MapPin, Sliders, Info, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Catalog, DatasetSource, GridSource, MapLayerConfig, RasterField, Station, TimeStepData } from '../types';
import { RIVER_BASINS } from '../data/nerData';
import { api } from '../api/client';
import { DIFF_CLASSES, PRECIP_CLASSES, diffRGBA, precipColor, precipRGBA } from '../utils/palette';
import { fieldToDataURL, valueAt } from '../utils/raster';

interface MapViewerProps {
  catalog: Catalog;
  stations: Station[];
  allTimelines: Record<string, TimeStepData[]>;
  dates: string[];
  availability: Record<string, { wrf: boolean; gpm: boolean; bfs: boolean; wrfRun?: string }>;
  mapDate: string;
  onMapDateChange: (d: string) => void;
  leadDay: number;
  config: MapLayerConfig;
  onUpdateConfig: (newConfig: Partial<MapLayerConfig>) => void;
  selectedStationId: string;
  onSelectStation: (stationId: string) => void;
}

type LayerData =
  | { kind: 'field'; field: RasterField; isDiff: boolean; label: string }
  | { kind: 'image'; url: string; bounds: [[number, number], [number, number]]; label: string }
  | { kind: 'none'; label: string; message: string };

const DS_LABEL: Record<DatasetSource, string> = { wrf: 'WRF', gpm: 'GPM', bfs: 'BFS', aws: 'AWS' };
const GRID_SOURCES: GridSource[] = ['wrf', 'gpm', 'bfs'];

async function loadLayer(ds: DatasetSource, cfg: MapLayerConfig, date: string, leadDay: number): Promise<LayerData> {
  const label = DS_LABEL[ds];
  if (!date) return { kind: 'none', label, message: 'No date selected' };
  if (ds === 'aws') return { kind: 'none', label, message: 'AWS gauges are shown as coloured markers' };
  try {
    if (cfg.showDiffLayer) {
      if (ds === cfg.diffReference) {
        return { kind: 'none', label, message: `Pick a reference other than ${label} for the bias field` };
      }
      const f = await api.diff(ds, cfg.diffReference, date, leadDay);
      return { kind: 'field', field: f, isDiff: true, label: `${label} − ${DS_LABEL[cfg.diffReference]}` };
    }
    if (ds === 'bfs') {
      const meta = await api.bfsMeta(date);
      if (!meta.numeric && meta.bounds) {
        const [s, w, n, e] = meta.bounds;
        return { kind: 'image', url: api.bfsImageUrl(date), bounds: [[s, w], [n, e]], label: `${label} (image)` };
      }
    }
    const f = await api.field(ds as GridSource, date, leadDay);
    return { kind: 'field', field: f, isDiff: false, label };
  } catch (e: any) {
    return { kind: 'none', label, message: e.message ?? String(e) };
  }
}

interface MapHandles {
  map: L.Map;
  raster: L.LayerGroup;
  vectors: L.LayerGroup;
}

function createMap(el: HTMLDivElement, center: L.LatLngExpression, zoom: number, zoomControl: boolean): MapHandles {
  const map = L.map(el, { center, zoom, zoomControl, attributionControl: false });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 14, subdomains: 'abcd' }).addTo(map);
  map.createPane('rasterPane');
  map.getPane('rasterPane')!.style.zIndex = '350';
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
    maxZoom: 14,
    subdomains: 'abcd',
    pane: 'shadowPane',
  }).addTo(map);
  return { map, raster: L.layerGroup().addTo(map), vectors: L.layerGroup().addTo(map) };
}

export const MapViewer: React.FC<MapViewerProps> = ({
  catalog,
  stations,
  allTimelines,
  dates,
  availability,
  mapDate,
  onMapDateChange,
  leadDay,
  config,
  onUpdateConfig,
  selectedStationId,
  onSelectStation,
}) => {
  const leftEl = useRef<HTMLDivElement>(null);
  const rightEl = useRef<HTMLDivElement>(null);
  const left = useRef<MapHandles | null>(null);
  const right = useRef<MapHandles | null>(null);
  const leftReadout = useRef<HTMLSpanElement>(null);
  const rightReadout = useRef<HTMLSpanElement>(null);

  const [leftLayer, setLeftLayer] = useState<LayerData | null>(null);
  const [rightLayer, setRightLayer] = useState<LayerData | null>(null);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);
  const leftLayerRef = useRef<LayerData | null>(null);
  const rightLayerRef = useRef<LayerData | null>(null);
  leftLayerRef.current = leftLayer;
  rightLayerRef.current = rightLayer;

  // ------------------------------------------------------------ map lifecycle
  useEffect(() => {
    if (!leftEl.current || left.current) return;
    left.current = createMap(leftEl.current, [25.8, 92.8], 6, true);
    const m = left.current.map;
    m.on('mousemove', (e: L.LeafletMouseEvent) => updateReadout(leftLayerRef.current, e.latlng, leftReadout.current));
    m.on('mouseout', () => leftReadout.current && (leftReadout.current.textContent = ''));
    m.on('move', () => right.current?.map.setView(m.getCenter(), m.getZoom(), { animate: false }));
    return () => {
      left.current?.map.remove();
      left.current = null;
      right.current?.map.remove();
      right.current = null;
    };
  }, []);

  useEffect(() => {
    if (config.isSplitScreen && rightEl.current && !right.current && left.current) {
      const lm = left.current.map;
      right.current = createMap(rightEl.current, lm.getCenter(), lm.getZoom(), false);
      const m = right.current.map;
      m.on('mousemove', (e: L.LeafletMouseEvent) => updateReadout(rightLayerRef.current, e.latlng, rightReadout.current));
      m.on('mouseout', () => rightReadout.current && (rightReadout.current.textContent = ''));
    } else if (!config.isSplitScreen && right.current) {
      right.current.map.remove();
      right.current = null;
    }
    const t = setTimeout(() => {
      left.current?.map.invalidateSize();
      right.current?.map.invalidateSize();
    }, 60);
    return () => clearTimeout(t);
  }, [config.isSplitScreen]);

  function updateReadout(layer: LayerData | null, ll: L.LatLng, el: HTMLSpanElement | null) {
    if (!el) return;
    if (!layer || layer.kind !== 'field') {
      el.textContent = `${ll.lat.toFixed(3)}°N ${ll.lng.toFixed(3)}°E`;
      return;
    }
    const v = valueAt(layer.field, ll.lat, ll.lng);
    el.textContent = `${ll.lat.toFixed(3)}°N ${ll.lng.toFixed(3)}°E  →  ${v == null ? 'no data' : `${v > 0 && layer.isDiff ? '+' : ''}${v.toFixed(1)} mm`}`;
  }

  // ------------------------------------------------------------ fetch layers
  useEffect(() => {
    let cancelled = false;
    setLoadingLeft(true);
    loadLayer(config.primaryDataset, config, mapDate, leadDay).then((d) => {
      if (!cancelled) {
        setLeftLayer(d);
        setLoadingLeft(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [config.primaryDataset, config.showDiffLayer, config.diffReference, mapDate, leadDay]);

  useEffect(() => {
    if (!config.isSplitScreen) {
      setRightLayer(null);
      return;
    }
    let cancelled = false;
    setLoadingRight(true);
    loadLayer(config.secondaryDataset, config, mapDate, leadDay).then((d) => {
      if (!cancelled) {
        setRightLayer(d);
        setLoadingRight(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [config.isSplitScreen, config.secondaryDataset, config.showDiffLayer, config.diffReference, mapDate, leadDay]);

  // ------------------------------------------------------------ draw rasters
  const drawRaster = (h: MapHandles | null, layer: LayerData | null) => {
    if (!h) return;
    h.raster.clearLayers();
    if (!layer || !config.showGridMesh) return;
    let overlay: L.ImageOverlay | null = null;
    if (layer.kind === 'field') {
      const { url, bounds } = fieldToDataURL(layer.field, layer.isDiff ? diffRGBA : precipRGBA, {
        threshold: config.thresholdRainMm,
        isDiff: layer.isDiff,
      });
      overlay = L.imageOverlay(url, bounds, { opacity: config.opacity, pane: 'rasterPane', className: 'pixelated-overlay' });
    } else if (layer.kind === 'image') {
      overlay = L.imageOverlay(layer.url, layer.bounds, { opacity: config.opacity, pane: 'rasterPane' });
    }
    if (overlay) h.raster.addLayer(overlay);
  };

  useEffect(() => drawRaster(left.current, leftLayer), [leftLayer, config.showGridMesh, config.opacity, config.thresholdRainMm]);
  useEffect(
    () => drawRaster(right.current, rightLayer),
    [rightLayer, config.showGridMesh, config.opacity, config.thresholdRainMm, config.isSplitScreen]
  );

  // ------------------------------------------------------------ gauges + basins
  useEffect(() => {
    const valuesFor = (id: string) => (allTimelines[id] || []).find((d) => d.date === mapDate);

    const drawVectors = (h: MapHandles | null) => {
      if (!h) return;
      h.vectors.clearLayers();

      if (config.showBasinBoundaries !== false) {
        RIVER_BASINS.forEach((basin) => {
          if (config.selectedBasinFilter && config.selectedBasinFilter !== 'ALL' && basin.id !== config.selectedBasinFilter) return;
          const sel = config.selectedBasinFilter === basin.id;
          const poly = L.polygon(basin.polygon, {
            color: sel ? '#f43f5e' : '#38bdf8',
            weight: sel ? 3 : 1.5,
            dashArray: '5, 5',
            fill: false,
            interactive: false,
          });
          h.vectors.addLayer(poly);
        });
      }

      if (config.showAWSMarkers) {
        stations.forEach((stn) => {
          if (config.selectedStateFilter !== 'ALL' && stn.state !== config.selectedStateFilter) return;
          if (config.selectedBasinFilter && config.selectedBasinFilter !== 'ALL' && stn.basinId !== config.selectedBasinFilter) return;
          const d = valuesFor(stn.id);
          const obs = d?.rainAWS ?? null;
          const isSel = stn.id === selectedStationId;
          const marker = L.circleMarker([stn.lat, stn.lng], {
            radius: isSel ? 9 : obs == null ? 4 : 6,
            color: isSel ? '#22d3ee' : '#f8fafc',
            weight: isSel ? 3 : 1,
            fillColor: precipColor(obs),
            fillOpacity: obs == null ? 0.5 : 0.95,
          });
          const fmt = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)} mm`);
          marker.bindTooltip(`${stn.name}: ${fmt(obs)}`, { direction: 'top', offset: [0, -6] });
          const div = document.createElement('div');
          div.className = 'p-2 text-xs font-sans text-slate-100 min-w-[200px]';
          div.innerHTML = `
            <div class="font-bold text-sm text-cyan-400 mb-0.5">${stn.name}</div>
            <div class="text-slate-400 mb-2">${stn.district}, ${stn.state} • ${stn.sensorType}${
              stn.elevationMeters != null ? ` • ${stn.elevationMeters} m` : ''
            }</div>
            <div class="text-[10px] text-slate-500 mb-1">24 h ending ${mapDate} ${String(catalog.dayEndHourUtc).padStart(2, '0')} UTC</div>
            <div class="grid grid-cols-2 gap-1 bg-slate-950 p-2 rounded border border-slate-800 mb-2 font-mono">
              <div>AWS: <strong class="text-rose-400">${fmt(obs)}</strong></div>
              <div>WRF: <strong class="text-indigo-300">${fmt(d?.rainWRF)}</strong></div>
              <div>GPM: <strong class="text-amber-300">${fmt(d?.rainGPM)}</strong></div>
              <div>BFS: <strong class="text-emerald-300">${fmt(d?.rainBFS)}</strong></div>
            </div>
            <button class="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-xs">Select station</button>`;
          div.querySelector('button')?.addEventListener('click', () => onSelectStation(stn.id));
          marker.bindPopup(div);
          h.vectors.addLayer(marker);
        });
      }
    };
    drawVectors(left.current);
    drawVectors(right.current);
  }, [stations, allTimelines, mapDate, config, selectedStationId, catalog.dayEndHourUtc, onSelectStation]);

  // ------------------------------------------------------------ date stepping
  const di = dates.indexOf(mapDate);
  const step = (k: number) => {
    const n = di + k;
    if (n >= 0 && n < dates.length) onMapDateChange(dates[n]);
  };
  const av = availability[mapDate];

  const statusLine = (layer: LayerData | null, loading: boolean) => {
    if (loading) return 'loading…';
    if (!layer) return '';
    if (layer.kind === 'none') return layer.message;
    if (layer.kind === 'image') return 'colour image (no values)';
    const s = layer.field.stats;
    const run = layer.field.meta?.run ? ` • run ${layer.field.meta.run}` : '';
    return s.validCells ? `min ${s.min} • mean ${s.mean} • max ${s.max} mm${run}` : 'no valid cells';
  };

  const DatasetButtons: React.FC<{ value: DatasetSource; onPick: (d: DatasetSource) => void; label: string; tone: string }> = ({
    value,
    onPick,
    label,
    tone,
  }) => (
    <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
      <span className="text-[10px] font-bold text-slate-400 uppercase px-2">{label}</span>
      {(['wrf', 'gpm', 'bfs', 'aws'] as DatasetSource[]).map((ds) => {
        const has = ds === 'aws' ? true : av ? av[ds] : false;
        return (
          <button
            key={ds}
            onClick={() => onPick(ds)}
            title={has ? '' : `No ${DS_LABEL[ds]} data for ${mapDate}`}
            className={`px-2.5 py-1 rounded text-xs font-bold uppercase transition ${
              value === ds ? `${tone} text-white shadow-md` : has ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {ds}
          </button>
        );
      })}
    </div>
  );

  const isDiffView = config.showDiffLayer;

  return (
    <div className="relative w-full h-[calc(100vh-8rem)] min-h-[550px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex flex-col">
      <style>{`.pixelated-overlay{image-rendering:pixelated;image-rendering:crisp-edges}`}</style>
      <div className="absolute top-4 left-4 right-4 z-[500] flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 backdrop-blur-md p-3 rounded-xl border border-slate-800 shadow-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date stepper */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button onClick={() => step(-1)} disabled={di <= 0} className="p-1 text-slate-300 disabled:text-slate-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <select
              value={mapDate}
              onChange={(e) => onMapDateChange(e.target.value)}
              className="bg-slate-900 text-slate-200 text-xs font-bold py-1 px-2 rounded border border-slate-700 focus:outline-none"
            >
              {dates.map((d) => {
                const a = availability[d];
                const tag = a ? ['wrf', 'gpm', 'bfs'].filter((k) => (a as any)[k]).map((k) => k.toUpperCase()).join('+') : '';
                return (
                  <option key={d} value={d}>
                    {d} {tag ? `(${tag})` : '(obs only)'}
                  </option>
                );
              })}
            </select>
            <button onClick={() => step(1)} disabled={di < 0 || di >= dates.length - 1} className="p-1 text-slate-300 disabled:text-slate-700">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <DatasetButtons value={config.primaryDataset} onPick={(d) => onUpdateConfig({ primaryDataset: d })} label="Layer" tone="bg-cyan-600" />

          {config.isSplitScreen && (
            <DatasetButtons
              value={config.secondaryDataset}
              onPick={(d) => onUpdateConfig({ secondaryDataset: d })}
              label="Right"
              tone="bg-indigo-600"
            />
          )}

          <button
            onClick={() => onUpdateConfig({ showDiffLayer: !config.showDiffLayer })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition ${
              isDiffView ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isDiffView ? 'Bias field' : 'Absolute'}</span>
          </button>

          {isDiffView && (
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-purple-500/40">
              <span className="text-[10px] font-bold text-purple-300 uppercase px-2">minus</span>
              {GRID_SOURCES.map((ds) => (
                <button
                  key={ds}
                  onClick={() => onUpdateConfig({ diffReference: ds })}
                  className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                    config.diffReference === ds ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ds}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => onUpdateConfig({ isSplitScreen: !config.isSplitScreen })}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition ${
              config.isSplitScreen ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span>{config.isSplitScreen ? 'Dual view' : 'Single map'}</span>
          </button>

          <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Basin:</span>
            <select
              value={config.selectedBasinFilter || 'ALL'}
              onChange={(e) => onUpdateConfig({ selectedBasinFilter: e.target.value })}
              className="bg-slate-900 text-slate-200 text-xs font-bold py-1 px-2 rounded border border-slate-700 focus:outline-none"
            >
              <option value="ALL">All</option>
              {RIVER_BASINS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onUpdateConfig({ showBasinBoundaries: !(config.showBasinBoundaries !== false) })}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 border transition ${
              config.showBasinBoundaries !== false
                ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Basins</span>
          </button>
          <button
            onClick={() => onUpdateConfig({ showAWSMarkers: !config.showAWSMarkers })}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 border transition ${
              config.showAWSMarkers ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Gauges</span>
          </button>
          <button
            onClick={() => onUpdateConfig({ showGridMesh: !config.showGridMesh })}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 border transition ${
              config.showGridMesh ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-slate-950 text-slate-500 border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Raster</span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full h-full flex relative">
        <div className="flex-1 h-full relative">
          <div ref={leftEl} className="w-full h-full z-10" />
          <div className="absolute bottom-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-xs shadow-lg space-y-0.5 max-w-[60%]">
            <div className="font-bold text-cyan-300 flex items-center space-x-2">
              {loadingLeft ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-cyan-400"></span>}
              <span>
                {leftLayer?.label ?? DS_LABEL[config.primaryDataset]} • {mapDate}
                {config.primaryDataset === 'wrf' && !isDiffView ? ` • Day-${leadDay}` : ''}
              </span>
            </div>
            <div className="text-slate-400 font-mono text-[10px]">{statusLine(leftLayer, loadingLeft)}</div>
            <div className="text-slate-200 font-mono text-[10px]">
              <span ref={leftReadout}></span>
            </div>
          </div>
        </div>

        {config.isSplitScreen && (
          <div className="flex-1 h-full relative border-l-2 border-slate-800">
            <div ref={rightEl} className="w-full h-full z-10" />
            <div className="absolute bottom-4 left-4 z-[500] bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-slate-800 text-xs space-y-0.5 max-w-[70%]">
              <div className="font-bold text-indigo-300 flex items-center space-x-2">
                {loadingRight ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-2 h-2 rounded-full bg-indigo-400"></span>}
                <span>{rightLayer?.label ?? DS_LABEL[config.secondaryDataset]}</span>
              </div>
              <div className="text-slate-400 font-mono text-[10px]">{statusLine(rightLayer, loadingRight)}</div>
              <div className="text-slate-200 font-mono text-[10px]">
                <span ref={rightReadout}></span>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 right-4 z-[500] bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-800 shadow-2xl max-w-xs">
          <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center justify-between space-x-3">
            <span>{isDiffView ? 'Bias (layer − reference), mm/day' : 'IMD rainfall classes (mm/day)'}</span>
            <Info className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="space-y-1 text-[10px] font-medium">
            {(isDiffView ? DIFF_CLASSES : PRECIP_CLASSES).map((c) => (
              <div key={c.label} className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: c.color }}></span>
                <span className="text-slate-300">{c.label}</span>
              </div>
            ))}
            <div className="flex items-center space-x-2 pt-1">
              <span className="w-3 h-3 rounded-full bg-[#475569] border border-slate-300"></span>
              <span className="text-slate-400">Gauge: no report</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800 space-y-1 text-[10px] text-slate-400">
            <div className="flex items-center justify-between">
              <span>Opacity</span>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={config.opacity}
                onChange={(e) => onUpdateConfig({ opacity: parseFloat(e.target.value) })}
                className="w-20 accent-cyan-500 cursor-pointer"
              />
            </div>
            {!isDiffView && (
              <div className="flex items-center justify-between">
                <span>Hide below</span>
                <select
                  value={config.thresholdRainMm}
                  onChange={(e) => onUpdateConfig({ thresholdRainMm: parseFloat(e.target.value) })}
                  className="bg-slate-900 text-slate-200 rounded border border-slate-700 px-1"
                >
                  {[0.1, 2.5, 15.6, 64.5].map((t) => (
                    <option key={t} value={t}>
                      {t} mm
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
