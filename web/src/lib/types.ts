export interface CommitMeta {
  commit_id: number;
  prefix: string;
  sha: string;
  ts: number;
  year: number;
  status: string;
}

export type SuiteKey = string; // suite name or '__merge__'

export interface CoverageRow {
  path: string;
  lf: number;
  lh: number;
  brf: number;
  brh: number;
  fnf: number;
  fnh: number;
}

export interface TimelinePoint {
  commit_id: number;
  ts: number;
  status: string;
  suite: string;
  lf: number;
  lh: number;
  brf: number;
  brh: number;
  fnf: number;
  fnh: number;
}

export interface DatasetMeta {
  generated_at: number;
  commit_count: number;
  coverage_records: number;
  suites: string[];
  statuses: Record<string, number>;
  prefix_stripped: string | null;
  first_ts: number | null;
  last_ts: number | null;
}

export type ColorMetric = 'lines' | 'branches' | 'functions';

export interface MetricTotals {
  lf: number;
  lh: number;
  brf: number;
  brh: number;
  fnf: number;
  fnh: number;
}

export function ratioFor(m: MetricTotals, metric: ColorMetric): number | null {
  const total = metric === 'lines' ? m.lf : metric === 'branches' ? m.brf : m.fnf;
  const hit = metric === 'lines' ? m.lh : metric === 'branches' ? m.brh : m.fnh;
  if (!total) return null;
  return Math.max(0, Math.min(1, hit / total));
}
