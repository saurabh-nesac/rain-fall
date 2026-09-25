import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, ServerCrash, RefreshCw } from 'lucide-react';
import { Navbar, TabId } from './components/Navbar';
import { OverviewSection } from './components/OverviewSection';
import { MapViewer } from './components/MapViewer';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { MetricsDashboard } from './components/MetricsDashboard';
import { StationTable } from './components/StationTable';
import { BasinSection } from './components/BasinSection';
import { InfoModal } from './components/InfoModal';
import { DataSourcesModal } from './components/DataSourcesModal';

import { api } from './api/client';
import { assignBasin, computeContinuousMetrics, computeAllBasinMetrics, normaliseState } from './data/nerData';
import { Catalog, DatasetSource, MapLayerConfig, Station, TimeStepData, ValidationResponse } from './types';

export interface Period {
  start: string;
  end: string;
  leadDay: number;
}

function defaultPeriod(cat: Catalog): Period {
  const wrfDates = Object.keys(cat.dates.wrf).sort();
  const aws = cat.dates.aws;
  if (wrfDates.length) {
    return { start: wrfDates[0], end: wrfDates[wrfDates.length - 1], leadDay: 1 };
  }
  if (aws.length) return { start: aws[0], end: aws[aws.length - 1], leadDay: 1 };
  const today = new Date().toISOString().slice(0, 10);
  return { start: today, end: today, leadDay: 1 };
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [selectedEvalDataset, setSelectedEvalDataset] = useState<DatasetSource>('wrf');
  const [mapDate, setMapDate] = useState<string>('');

  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);

  const [mapConfig, setMapConfig] = useState<MapLayerConfig>({
    primaryDataset: 'wrf',
    secondaryDataset: 'gpm',
    diffReference: 'gpm',
    isSplitScreen: false,
    showDiffLayer: false,
    showAWSMarkers: true,
    showGridMesh: true,
    showBasinBoundaries: true,
    opacity: 0.8,
    selectedStateFilter: 'ALL',
    selectedBasinFilter: 'ALL',
    thresholdRainMm: 0.1,
  });

  // ------------------------------------------------------------ bootstrap
  const boot = useCallback(async (reload = false) => {
    setBootError(null);
    try {
      const [cat, stns] = await Promise.all([reload ? api.reload() : api.catalog(), api.stations()]);
      const enriched = stns.map((s) => ({ ...s, state: normaliseState(s.state), basinId: assignBasin(s.lat, s.lng) }));
      setCatalog(cat);
      setStations(enriched);
      setPeriod((p) => p ?? defaultPeriod(cat));
      setSelectedStationId((id) => {
        if (id && enriched.some((s) => s.id === id)) return id;
        const reporting = [...enriched].sort((a, b) => (b.daysReported ?? 0) - (a.daysReported ?? 0));
        return reporting[0]?.id ?? '';
      });
      if (reload) setValidation(null);
    } catch (e: any) {
      setBootError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  // ------------------------------------------------------------ validation table
  useEffect(() => {
    if (!period || !catalog) return;
    let cancelled = false;
    setValidationLoading(true);
    setValidationError(null);
    api
      .validation(period.start, period.end, period.leadDay)
      .then((v) => {
        if (cancelled) return;
        setValidation(v);
        // map date: latest day in the period that has WRF, else the last day
        const withWrf = v.dates.filter((d) => v.availability[d]?.wrf);
        setMapDate((cur) => (cur && v.dates.includes(cur) ? cur : withWrf[withWrf.length - 1] ?? v.dates[v.dates.length - 1]));
      })
      .catch((e) => !cancelled && setValidationError(e.message ?? String(e)))
      .finally(() => !cancelled && setValidationLoading(false));
    return () => {
      cancelled = true;
    };
  }, [period, catalog]);

  const allTimelines = useMemo(() => {
    const out: Record<string, TimeStepData[]> = {};
    if (!validation) return out;
    (Object.entries(validation.stations) as [string, ValidationResponse['stations'][string]][]).forEach(([id, rows]) => {
      out[id] = rows.map((r) => ({ date: r.date, rainAWS: r.aws, rainWRF: r.wrf, rainBFS: r.bfs, rainGPM: r.gpm }));
    });
    return out;
  }, [validation]);

  const visibleStations = useMemo(
    () => (selectedState === 'ALL' ? stations : stations.filter((s) => s.state === selectedState)),
    [stations, selectedState]
  );

  const basinMetrics = useMemo(() => computeAllBasinMetrics(stations, allTimelines), [stations, allTimelines]);

  const currentStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) || stations[0],
    [stations, selectedStationId]
  );

  const overallMetrics = useMemo(() => {
    const pick = (k: 'rainWRF' | 'rainBFS' | 'rainGPM') =>
      visibleStations.flatMap((s) => (allTimelines[s.id] || []).map((d) => ({ obs: d.rainAWS, model: d[k] })));
    return {
      wrf: computeContinuousMetrics(pick('rainWRF')),
      bfs: computeContinuousMetrics(pick('rainBFS')),
      gpm: computeContinuousMetrics(pick('rainGPM')),
    };
  }, [allTimelines, visibleStations]);

  const handleUpdateMapConfig = (newConfig: Partial<MapLayerConfig>) => setMapConfig((prev) => ({ ...prev, ...newConfig }));

  const handleExportFullReport = () => {
    if (!validation || !period) return;
    const report = {
      region: 'North-East Region (NER) India',
      generatedAt: new Date().toISOString(),
      period,
      dayWindow: `${String(validation.dayEndHourUtc).padStart(2, '0')} UTC -> ${String(validation.dayEndHourUtc).padStart(2, '0')} UTC (date = window end)`,
      stationSampling: validation.sampling,
      stateFilter: selectedState,
      wrfRuns: catalog?.runs.map((r) => ({ id: r.id, init: r.init, end: r.end, dxKm: r.dxKm })),
      overallMetricsVsAWS: overallMetrics,
      stations: visibleStations.length,
      availability: validation.availability,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NER_validation_${period.start}_${period.end}_D${period.leadDay}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------ boot screens
  if (bootError) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center space-x-2 text-rose-400 font-bold">
            <ServerCrash className="w-5 h-5" />
            <span>Cannot load validation data</span>
          </div>
          <p className="text-sm text-slate-300">{bootError}</p>
          <pre className="text-xs bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-400 overflow-x-auto">
            cd server{'\n'}pip install -r requirements.txt{'\n'}uvicorn app:app --port 8000
          </pre>
          <button
            onClick={() => boot()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-bold flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  if (!catalog || !period) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center space-x-3">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="text-sm">Scanning WRF, GPM, BFS and AWS sources…</span>
      </div>
    );
  }

  const noStations = stations.length === 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        catalog={catalog}
        period={period}
        onChangePeriod={setPeriod}
        selectedState={selectedState}
        onSelectState={(st) => {
          setSelectedState(st);
          handleUpdateMapConfig({ selectedStateFilter: st });
        }}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenInfo={() => setIsInfoOpen(true)}
        onExportReport={handleExportFullReport}
        onOpenSources={() => setIsSourcesOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {validationLoading && (
          <div className="flex items-center space-x-2 text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              Computing station-day values for {period.start} → {period.end} (lead day {period.leadDay}). First load of GPM
              half-hourly files can take a while…
            </span>
          </div>
        )}
        {validationError && (
          <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
            {validationError}
          </div>
        )}
        {noStations && (
          <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            No AWS stations were loaded. Open <strong>Data Sources</strong> to check the Excel path and warnings.
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewSection
            catalog={catalog}
            period={period}
            validation={validation}
            stations={visibleStations}
            allTimelines={allTimelines}
            overallMetricsWRF={overallMetrics.wrf}
            overallMetricsBFS={overallMetrics.bfs}
            overallMetricsGPM={overallMetrics.gpm}
            onNavigateTab={setActiveTab}
            onSelectStation={setSelectedStationId}
          />
        )}

        {activeTab === 'map' && (
          <MapViewer
            catalog={catalog}
            stations={stations}
            allTimelines={allTimelines}
            dates={validation?.dates ?? []}
            availability={validation?.availability ?? {}}
            mapDate={mapDate}
            onMapDateChange={setMapDate}
            leadDay={period.leadDay}
            config={mapConfig}
            onUpdateConfig={handleUpdateMapConfig}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
          />
        )}

        {activeTab === 'timeseries' && currentStation && (
          <TimeSeriesPlot
            station={currentStation}
            timelineData={allTimelines[currentStation.id] || []}
            allStations={visibleStations.length ? visibleStations : stations}
            onSelectStation={setSelectedStationId}
            runs={catalog.runs}
            dayEndHourUtc={catalog.dayEndHourUtc}
          />
        )}

        {activeTab === 'metrics' && (
          <MetricsDashboard
            stations={visibleStations}
            allTimelines={allTimelines}
            selectedDataset={selectedEvalDataset}
            onSelectDataset={setSelectedEvalDataset}
            leadDay={period.leadDay}
          />
        )}

        {activeTab === 'stations' && (
          <StationTable
            stations={visibleStations}
            allTimelines={allTimelines}
            selectedStationId={selectedStationId}
            onSelectStation={setSelectedStationId}
            onSwitchToTimeSeries={() => setActiveTab('timeseries')}
          />
        )}

        {activeTab === 'basins' && (
          <BasinSection
            basinMetrics={basinMetrics}
            stations={stations}
            onSelectBasinOnMap={(basinId) => {
              handleUpdateMapConfig({ selectedBasinFilter: basinId, showBasinBoundaries: true });
              setActiveTab('map');
            }}
            onSelectStation={(stnId) => {
              setSelectedStationId(stnId);
              setActiveTab('timeseries');
            }}
            onNavigateTab={setActiveTab}
          />
        )}
      </main>

      <footer className="bg-slate-900/80 border-t border-slate-800/80 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            <strong>NER Rainfall Validation</strong> • WRF{' '}
            {catalog.runs[0] ? `d${String(catalog.runs[0].gridId).padStart(2, '0')} ${catalog.runs[0].dxKm} km` : ''} | GPM IMERG
            half-hourly | BFS | AWS/ARG daily ({String(catalog.dayEndHourUtc).padStart(2, '0')} UTC day)
          </div>
          <div>North-Eastern Space Applications Centre (NESAC)</div>
        </div>
      </footer>

      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} catalog={catalog} />
      <DataSourcesModal
        isOpen={isSourcesOpen}
        onClose={() => setIsSourcesOpen(false)}
        catalog={catalog}
        onReload={() => boot(true)}
      />
    </div>
  );
}
