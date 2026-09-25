export type DatasetSource = 'wrf' | 'bfs' | 'gpm' | 'aws';
export type GridSource = Exclude<DatasetSource, 'aws'>;

export interface Station {
  id: string;
  name: string;
  state: string;
  district: string;
  basinId?: string; // assigned client-side by point-in-polygon against RIVER_BASINS
  lat: number;
  lng: number;
  elevationMeters: number | null;
  status: 'active' | 'maintenance' | 'offline';
  sensorType: string; // AWS / ARG
  reportHourUtc?: number | null;
  daysReported?: number;
  daysInSheet?: number;
}

/** One verification day (window ending at `dayEndHourUtc` on `date`). null = no data. */
export interface TimeStepData {
  date: string; // YYYY-MM-DD, end date of the 24 h window
  rainAWS: number | null;
  rainWRF: number | null;
  rainBFS: number | null;
  rainGPM: number | null;
}

export interface HourlyRow {
  time: string; // ISO UTC, end of interval
  leadHour: number;
  wrf: number | null;
  gpm: number | null;
}

export interface MetricPair {
  obs: number | null;
  model: number | null;
}

export interface ContinuousMetrics {
  rmse: number;
  mae: number;
  bias: number;
  correlation: number; // Pearson r
  nse: number; // Nash-Sutcliffe Efficiency
  sdRatio: number; // Ratio of standard deviations
  sampleCount: number;
}

export interface CategoricalMetrics {
  thresholdMm: number;
  hits: number;
  falseAlarms: number;
  misses: number;
  correctNegatives: number;
  pod: number;
  far: number;
  ts: number;
  ets: number;
  fbi: number;
}

export interface RiverBasin {
  id: string;
  name: string;
  code: string;
  parentSystem: 'Brahmaputra' | 'Barak-Surma' | 'Teesta' | 'Chindwin' | 'Tripura-Coastal';
  areaSqKm: number;
  states: string[];
  centerLat: number;
  centerLng: number;
  polygon: [number, number][];
  gaugeStationCount: number;
  floodThresholdMm: number;
}

export type FloodRiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe' | 'No data';

export interface BasinMetrics {
  basinId: string;
  basinName: string;
  parentSystem: string;
  meanRainAWS: number | null;
  meanRainWRF: number | null;
  meanRainBFS: number | null;
  meanRainGPM: number | null;
  wrfBias: number | null;
  wrfRmse: number | null;
  correlation: number | null;
  pairedSamples: number;
  floodRiskLevel: FloodRiskLevel;
  accumulatedVolumeMCM: number | null; // basin area x mean daily gauge rain
  stationCount: number;
}

export interface MapLayerConfig {
  primaryDataset: DatasetSource;
  secondaryDataset: DatasetSource;
  diffReference: GridSource; // bias = primary - reference
  isSplitScreen: boolean;
  showDiffLayer: boolean;
  showAWSMarkers: boolean;
  showGridMesh: boolean; // raster layer on/off
  showBasinBoundaries?: boolean;
  opacity: number;
  selectedStateFilter: string;
  selectedBasinFilter?: string;
  thresholdRainMm: number;
}

// ------------------------------------------------------------------ API payloads

export interface RasterField {
  nlat: number;
  nlon: number;
  latEdges: number[]; // ascending, length nlat+1
  lonEdges: number[]; // ascending, length nlon+1
  values: (number | null)[]; // row-major, row 0 = southernmost
  bounds: [number, number, number, number]; // south, west, north, east
  stats: { min: number | null; max: number | null; mean: number | null; validCells: number };
  statsA?: RasterField['stats'];
  statsB?: RasterField['stats'];
  meta: Record<string, any>;
}

export interface WrfRunInfo {
  id: string;
  init: string;
  end: string;
  forecastHours: number;
  outputIntervalHours: number | null;
  nTimes: number;
  files: string[];
  dxKm: number;
  gridId: number;
  projection: string;
  physics: Record<string, number>;
  title: string;
}

export interface Catalog {
  loadedAt: string;
  dayEndHourUtc: number;
  stationSampling: 'nearest' | 'bilinear';
  runs: WrfRunInfo[];
  dates: {
    wrf: Record<string, number[]>; // date -> available lead days
    gpm: string[];
    bfs: string[];
    aws: string[];
  };
  bfsNumeric: boolean | null;
  counts: {
    wrfRuns: number;
    gpmFiles: number;
    bfsFiles: number;
    awsStations: number;
    awsStationsReporting: number;
  };
  sources: Record<string, { warnings: string[]; [k: string]: any }>;
}

export interface ValidationResponse {
  start: string;
  end: string;
  leadDay: number;
  dates: string[];
  availability: Record<string, { wrf: boolean; gpm: boolean; bfs: boolean; wrfRun?: string }>;
  stations: Record<string, { date: string; aws: number | null; wrf: number | null; gpm: number | null; bfs: number | null }[]>;
  sampling: string;
  dayEndHourUtc: number;
}
