import { interpolateRdYlGn } from 'd3-scale-chromatic';

export const NO_DATA_COLOR = '#4b5563';

export function coverageColor(ratio: number | null): string {
  if (ratio === null || ratio < 0 || Number.isNaN(ratio)) return NO_DATA_COLOR;
  return interpolateRdYlGn(Math.max(0, Math.min(1, ratio)));
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null || ratio < 0) return 'n/a';
  return `${(ratio * 100).toFixed(1)}%`;
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}
