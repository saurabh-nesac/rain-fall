import {
  Station,
  TimeStepData,
  ContinuousMetrics,
  CategoricalMetrics,
  RiverBasin,
  BasinMetrics,
  MetricPair,
  FloodRiskLevel,
} from '../types';

// NOTE: basin polygons below are coarse hand-drawn outlines, not surveyed catchment
// boundaries. Replace with real shapefile-derived polygons for operational use.

export const RIVER_BASINS: RiverBasin[] = [
  {
    id: 'BASIN_BRAHMAPUTRA_MAIN',
    name: 'Brahmaputra Main Valley Basin',
    code: 'BRH-MAIN',
    parentSystem: 'Brahmaputra',
    areaSqKm: 58000,
    states: ['Assam', 'Arunachal Pradesh', 'Meghalaya'],
    centerLat: 26.50,
    centerLng: 92.50,
    polygon: [
      [26.0, 90.0],
      [26.8, 91.5],
      [27.3, 93.8],
      [27.6, 95.0],
      [27.0, 95.5],
      [26.2, 94.2],
      [25.9, 92.0],
      [26.0, 90.0]
    ],
    gaugeStationCount: 6,
    floodThresholdMm: 65.0,
  },
  {
    id: 'BASIN_MEGHALAYA_SOUTH',
    name: 'South Meghalaya & Kopili Basin',
    code: 'MEG-KOP',
    parentSystem: 'Brahmaputra',
    areaSqKm: 22400,
    states: ['Meghalaya', 'Assam'],
    centerLat: 25.40,
    centerLng: 91.80,
    polygon: [
      [25.1, 90.1],
      [25.6, 90.1],
      [25.8, 92.3],
      [25.5, 92.8],
      [25.0, 92.4],
      [25.1, 90.1]
    ],
    gaugeStationCount: 5,
    floodThresholdMm: 90.0,
  },
  {
    id: 'BASIN_SUBANSIRI',
    name: 'Subansiri River Basin',
    code: 'SUB-BASIN',
    parentSystem: 'Brahmaputra',
    areaSqKm: 32600,
    states: ['Arunachal Pradesh', 'Assam'],
    centerLat: 27.60,
    centerLng: 93.90,
    polygon: [
      [27.1, 93.2],
      [28.2, 93.3],
      [28.4, 94.3],
      [27.3, 94.4],
      [27.1, 93.2]
    ],
    gaugeStationCount: 3,
    floodThresholdMm: 70.0,
  },
  {
    id: 'BASIN_SIANG_LOHIT',
    name: 'Upper Siang-Lohit-Dibang Basin',
    code: 'SNG-LHT',
    parentSystem: 'Brahmaputra',
    areaSqKm: 46200,
    states: ['Arunachal Pradesh', 'Assam'],
    centerLat: 28.10,
    centerLng: 95.50,
    polygon: [
      [27.5, 94.8],
      [28.6, 94.8],
      [28.8, 96.5],
      [27.7, 96.5],
      [27.5, 94.8]
    ],
    gaugeStationCount: 3,
    floodThresholdMm: 80.0,
  },
  {
    id: 'BASIN_BARAK_SURMA',
    name: 'Barak & Surma Valley Basin',
    code: 'BRK-SRM',
    parentSystem: 'Barak-Surma',
    areaSqKm: 26100,
    states: ['Assam', 'Manipur', 'Mizoram', 'Tripura'],
    centerLat: 24.60,
    centerLng: 92.90,
    polygon: [
      [24.0, 92.0],
      [25.1, 92.1],
      [25.2, 93.5],
      [24.2, 93.8],
      [23.8, 92.8],
      [24.0, 92.0]
    ],
    gaugeStationCount: 4,
    floodThresholdMm: 60.0,
  },
  {
    id: 'BASIN_MANAS_BEKI',
    name: 'Manas-Beki River Basin',
    code: 'MNS-BKI',
    parentSystem: 'Brahmaputra',
    areaSqKm: 18300,
    states: ['Assam', 'Arunachal Pradesh'],
    centerLat: 26.70,
    centerLng: 91.10,
    polygon: [
      [26.2, 89.8],
      [27.2, 90.2],
      [27.3, 91.7],
      [26.1, 91.5],
      [26.2, 89.8]
    ],
    gaugeStationCount: 2,
    floodThresholdMm: 65.0,
  },
  {
    id: 'BASIN_IMPHAL_CHINDWIN',
    name: 'Imphal & Chindwin Basin',
    code: 'MPH-CHN',
    parentSystem: 'Chindwin',
    areaSqKm: 18500,
    states: ['Manipur', 'Nagaland'],
    centerLat: 24.80,
    centerLng: 93.90,
    polygon: [
      [24.1, 93.4],
      [25.4, 93.5],
      [25.5, 94.6],
      [24.1, 94.5],
      [24.1, 93.4]
    ],
    gaugeStationCount: 3,
    floodThresholdMm: 55.0,
  },
  {
    id: 'BASIN_TRIPURA_RIVERS',
    name: 'Gumti-Manu Tripura Rivers',
    code: 'GMT-MNU',
    parentSystem: 'Tripura-Coastal',
    areaSqKm: 10400,
    states: ['Tripura'],
    centerLat: 23.80,
    centerLng: 91.50,
    polygon: [
      [23.0, 91.0],
      [24.5, 91.1],
      [24.5, 92.3],
      [23.0, 92.1],
      [23.0, 91.0]
    ],
    gaugeStationCount: 2,
    floodThresholdMm: 50.0,
  },
  {
    id: 'BASIN_TEESTA_SIKKIM',
    name: 'Teesta & Rangit Basin',
    code: 'TST-SKM',
    parentSystem: 'Teesta',
    areaSqKm: 12500,
    states: ['Sikkim'],
    centerLat: 27.50,
    centerLng: 88.50,
    polygon: [
      [27.0, 88.0],
      [28.1, 88.2],
      [28.0, 88.9],
      [27.0, 88.8],
      [27.0, 88.0]
    ],
    gaugeStationCount: 2,
    floodThresholdMm: 70.0,
  }
];

export const NER_STATES = [
  'Arunachal Pradesh',
  'Assam',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Sikkim',
  'Tripura',
];


/** Title-case a state name as it comes from the AWS sheet so it matches NER_STATES. */
export function normaliseState(s: string): string {
  const hit = NER_STATES.find((n) => n.toLowerCase() === s.trim().toLowerCase());
  return hit ?? s;
}

/** Ray-casting point-in-polygon; polygon given as [lat, lng] pairs. */
function inPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function assignBasin(lat: number, lng: number): string | undefined {
  return RIVER_BASINS.find((b) => inPolygon(lat, lng, b.polygon))?.id;
}

/** Keep only pairs where both observation and model/estimate exist. */
export function completePairs(pairs: MetricPair[]): { obs: number; model: number }[] {
  return pairs.filter((p): p is { obs: number; model: number } => p.obs != null && p.model != null);
}

/** Format a metric; shows an em dash when there are too few samples to be meaningful. */
export function fmtMetric(value: number, n: number, minN = 2, signed = false): string {
  if (n < minN || !Number.isFinite(value)) return '—';
  return signed && value > 0 ? `+${value}` : `${value}`;
}

// Continuous verification metrics (RMSE, MAE, Bias, Pearson r, NSE). Missing values are dropped.
export function computeContinuousMetrics(input: MetricPair[]): ContinuousMetrics {
  const pairs = completePairs(input);
  const n = pairs.length;
  if (n === 0) {
    return { rmse: 0, mae: 0, bias: 0, correlation: 0, nse: 0, sdRatio: 0, sampleCount: 0 };
  }

  let sumObs = 0;
  let sumModel = 0;
  let sumDiff = 0;
  let sumAbsDiff = 0;
  let sumSqDiff = 0;
  for (const p of pairs) {
    sumObs += p.obs;
    sumModel += p.model;
    const diff = p.model - p.obs;
    sumDiff += diff;
    sumAbsDiff += Math.abs(diff);
    sumSqDiff += diff * diff;
  }
  const meanObs = sumObs / n;
  const meanModel = sumModel / n;
  const mae = Math.round((sumAbsDiff / n) * 100) / 100;
  const rmse = Math.round(Math.sqrt(sumSqDiff / n) * 100) / 100;
  const bias = Math.round((sumDiff / n) * 100) / 100;

  let numerator = 0;
  let denomObs = 0;
  let denomModel = 0;
  for (const p of pairs) {
    const dObs = p.obs - meanObs;
    const dModel = p.model - meanModel;
    numerator += dObs * dModel;
    denomObs += dObs * dObs;
    denomModel += dModel * dModel;
  }
  const sdObs = Math.sqrt(denomObs / n);
  const sdModel = Math.sqrt(denomModel / n);
  const sdRatio = sdObs > 0 ? Math.round((sdModel / sdObs) * 100) / 100 : NaN;
  const correlation =
    denomObs > 0 && denomModel > 0 ? Math.round((numerator / Math.sqrt(denomObs * denomModel)) * 1000) / 1000 : NaN;
  const nse = denomObs > 0 ? Math.round((1 - sumSqDiff / denomObs) * 1000) / 1000 : NaN;

  return { rmse, mae, bias, correlation, nse, sdRatio, sampleCount: n };
}

// Categorical verification metrics (POD, FAR, TS, ETS, FBI) for a threshold.
export function computeCategoricalMetrics(input: MetricPair[], thresholdMm: number): CategoricalMetrics {
  const pairs = completePairs(input);
  let hits = 0;
  let falseAlarms = 0;
  let misses = 0;
  let correctNegatives = 0;
  for (const p of pairs) {
    const obsYes = p.obs >= thresholdMm;
    const modelYes = p.model >= thresholdMm;
    if (obsYes && modelYes) hits++;
    else if (!obsYes && modelYes) falseAlarms++;
    else if (obsYes && !modelYes) misses++;
    else correctNegatives++;
  }
  const total = hits + falseAlarms + misses + correctNegatives;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const pod = hits + misses > 0 ? r3(hits / (hits + misses)) : NaN;
  const far = hits + falseAlarms > 0 ? r3(falseAlarms / (hits + falseAlarms)) : NaN;
  const tsDen = hits + misses + falseAlarms;
  const ts = tsDen > 0 ? r3(hits / tsDen) : NaN;
  const fbi = hits + misses > 0 ? Math.round(((hits + falseAlarms) / (hits + misses)) * 100) / 100 : NaN;
  const hitsRandom = total > 0 ? ((hits + misses) * (hits + falseAlarms)) / total : 0;
  const etsDen = hits + misses + falseAlarms - hitsRandom;
  const ets = etsDen > 0 ? r3((hits - hitsRandom) / etsDen) : NaN;
  return { thresholdMm, hits, falseAlarms, misses, correctNegatives, pod, far, ts, ets, fbi };
}

const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// Basin-wise aggregation of station-day values. Means are over available station-days per source.
export function computeAllBasinMetrics(
  stations: Station[],
  allTimelines: Record<string, TimeStepData[]>
): BasinMetrics[] {
  return RIVER_BASINS.map((basin) => {
    const basinStations = stations.filter((s) => s.basinId === basin.id);
    const aws: number[] = [];
    const wrf: number[] = [];
    const bfs: number[] = [];
    const gpm: number[] = [];
    const pairsWRF: MetricPair[] = [];
    basinStations.forEach((stn) => {
      (allTimelines[stn.id] || []).forEach((d) => {
        if (d.rainAWS != null) aws.push(d.rainAWS);
        if (d.rainWRF != null) wrf.push(d.rainWRF);
        if (d.rainBFS != null) bfs.push(d.rainBFS);
        if (d.rainGPM != null) gpm.push(d.rainGPM);
        pairsWRF.push({ obs: d.rainAWS, model: d.rainWRF });
      });
    });
    const c = computeContinuousMetrics(pairsWRF);
    const meanRainAWS = mean(aws);

    let floodRiskLevel: FloodRiskLevel = 'No data';
    if (meanRainAWS != null) {
      floodRiskLevel = 'Low';
      if (meanRainAWS >= basin.floodThresholdMm * 1.4) floodRiskLevel = 'Severe';
      else if (meanRainAWS >= basin.floodThresholdMm) floodRiskLevel = 'High';
      else if (meanRainAWS >= basin.floodThresholdMm * 0.5) floodRiskLevel = 'Moderate';
    }

    return {
      basinId: basin.id,
      basinName: basin.name,
      parentSystem: basin.parentSystem,
      meanRainAWS,
      meanRainWRF: mean(wrf),
      meanRainBFS: mean(bfs),
      meanRainGPM: mean(gpm),
      wrfBias: c.sampleCount ? c.bias : null,
      wrfRmse: c.sampleCount ? c.rmse : null,
      correlation: c.sampleCount >= 3 && Number.isFinite(c.correlation) ? c.correlation : null,
      pairedSamples: c.sampleCount,
      floodRiskLevel,
      accumulatedVolumeMCM:
        meanRainAWS != null ? Math.round(((basin.areaSqKm * meanRainAWS) / 1000) * 10) / 10 : null,
      stationCount: basinStations.length,
    };
  });
}
