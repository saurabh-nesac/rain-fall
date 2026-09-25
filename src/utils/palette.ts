// IMD daily rainfall categories (mm/day) and a diverging bias scale.
export type RGBA = [number, number, number, number];

const hex = (h: string, a = 255): RGBA => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  a,
];

export const PRECIP_CLASSES = [
  { min: 0.1, max: 2.4, color: '#bae6fd', label: 'Very light (0.1 – 2.4)' },
  { min: 2.5, max: 15.5, color: '#38bdf8', label: 'Light (2.5 – 15.5)' },
  { min: 15.6, max: 64.4, color: '#3b82f6', label: 'Moderate (15.6 – 64.4)' },
  { min: 64.5, max: 115.5, color: '#eab308', label: 'Heavy (64.5 – 115.5)' },
  { min: 115.6, max: 204.4, color: '#f97316', label: 'Very heavy (115.6 – 204.4)' },
  { min: 204.5, max: Infinity, color: '#dc2626', label: 'Extremely heavy (≥ 204.5)' },
];

export const DIFF_CLASSES = [
  { min: 30, color: '#7c3aed', label: '> +30 mm (strong over-estimate)' },
  { min: 10, color: '#2563eb', label: '+10 to +30 mm' },
  { min: -10, color: '#64748b', label: '−10 to +10 mm (small error)' },
  { min: -30, color: '#eab308', label: '−30 to −10 mm' },
  { min: -Infinity, color: '#ef4444', label: '< −30 mm (strong under-estimate)' },
];

const PRECIP_RGBA = PRECIP_CLASSES.map((c) => hex(c.color));
const DIFF_RGBA = DIFF_CLASSES.map((c) => hex(c.color));

export function precipColor(v: number | null | undefined): string {
  if (v == null) return '#475569';
  if (v < 0.1) return '#94a3b8';
  for (let i = PRECIP_CLASSES.length - 1; i >= 0; i--) if (v >= PRECIP_CLASSES[i].min) return PRECIP_CLASSES[i].color;
  return PRECIP_CLASSES[0].color;
}

export function precipRGBA(v: number): RGBA | null {
  if (v < 0.1) return null;
  for (let i = PRECIP_CLASSES.length - 1; i >= 0; i--) if (v >= PRECIP_CLASSES[i].min) return PRECIP_RGBA[i];
  return PRECIP_RGBA[0];
}

export function diffRGBA(v: number): RGBA {
  for (let i = 0; i < DIFF_CLASSES.length; i++) if (v > DIFF_CLASSES[i].min) return DIFF_RGBA[i];
  return DIFF_RGBA[DIFF_RGBA.length - 1];
}
