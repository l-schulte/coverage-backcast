import type {
  CommitMeta,
  CoverageRow,
  DatasetMeta,
  ProjectIndex,
  ProjectInfo,
  TimelinePoint,
} from './types';

export const DATA_BASE: string = (import.meta.env.VITE_DATA_BASE as string | undefined) ?? '/data';

const PARQUET_FILES = ['commits.parquet', 'commit_suites.parquet', 'summary.parquet', 'coverage.parquet'];

export const MERGE_SUITE = '__merge__';

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export class CoverageDB {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private ready: Promise<void> | null = null;
  private cache = new Map<string, CoverageRow[]>();
  private cacheLimit = 48;
  private meta: DatasetMeta | null = null;
  private base: string;

  constructor(dataBase: string = DATA_BASE) {
    this.base = dataBase.replace(/\/+$/, '') || DATA_BASE;
    this.worker = new Worker(new URL('./duckdb.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const { id, ok, result, error } = event.data;
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error ?? 'worker error'));
    };
    this.worker.onerror = (event) => {
      for (const entry of this.pending.values()) entry.reject(new Error(event.message));
      this.pending.clear();
    };
  }

  private rpc<T>(message: Record<string, unknown>): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.worker.postMessage({ id, ...message });
    });
  }

  get dataBase(): string {
    return this.base;
  }

  get datasetMeta(): DatasetMeta | null {
    return this.meta;
  }

  async init(): Promise<DatasetMeta> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.rpc({ type: 'init' });
        await this.rpc({ type: 'load', dataBase: this.base, files: PARQUET_FILES });
      })();
    }
    await this.ready;
    if (!this.meta) {
      const response = await fetch(`${this.base}/meta.json`);
      this.meta = (await response.json()) as DatasetMeta;
    }
    return this.meta;
  }

  private query<T>(sql: string): Promise<T[]> {
    return this.rpc<T[]>({ type: 'query', sql });
  }

  async commits(): Promise<CommitMeta[]> {
    await this.init();
    return this.query<CommitMeta>(
      `SELECT commit_id, prefix, sha, ts, year, status FROM 'commits.parquet' ORDER BY commit_id`,
    );
  }

  async suites(): Promise<string[]> {
    await this.init();
    const rows = await this.query<{ suite: string }>(
      `SELECT DISTINCT suite FROM 'commit_suites.parquet' ORDER BY suite`,
    );
    return rows.map((row) => row.suite);
  }

  async timeline(): Promise<TimelinePoint[]> {
    await this.init();
    return this.query<TimelinePoint>(
      `SELECT c.commit_id, c.ts, c.status, s.suite, s.lf, s.lh, s.brf, s.brh, s.fnf, s.fnh
       FROM 'commits.parquet' c
       LEFT JOIN 'summary.parquet' s ON c.commit_id = s.commit_id
       ORDER BY c.commit_id`,
    );
  }

  async coverage(commitId: number, suite: string): Promise<CoverageRow[]> {
    const key = `${commitId}:${suite}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    await this.init();
    let rows: CoverageRow[];
    if (suite === MERGE_SUITE) {
      rows = await this.query<CoverageRow>(
        `SELECT path,
                CAST(max(lf) AS INTEGER) AS lf, CAST(max(lh) AS INTEGER) AS lh,
                CAST(max(brf) AS INTEGER) AS brf, CAST(max(brh) AS INTEGER) AS brh,
                CAST(max(fnf) AS INTEGER) AS fnf, CAST(max(fnh) AS INTEGER) AS fnh
         FROM 'coverage.parquet'
         WHERE commit_id = ${commitId}
         GROUP BY path`,
      );
    } else {
      const safe = suite.replace(/'/g, "''");
      rows = await this.query<CoverageRow>(
        `SELECT path, lf, lh, brf, brh, fnf, fnh
         FROM 'coverage.parquet'
         WHERE commit_id = ${commitId} AND suite = '${safe}'`,
      );
    }
    this.cache.set(key, rows);
    if (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return rows;
  }

  destroy(): void {
    this.worker.terminate();
  }
}

/** Data base URL for a project id (empty id = legacy flat layout). */
export function projectBase(id: string): string {
  const root = DATA_BASE.replace(/\/+$/, '');
  return id ? `${root}/${id}` : root;
}

const DEFAULT_PROJECT: ProjectInfo = { id: '', label: 'default' };

/**
 * Fetch the top-level projects index. Falls back to a single synthetic
 * "default" project when `projects.json` is absent, so existing flat
 * data directories keep working.
 */
export async function fetchProjects(): Promise<ProjectInfo[]> {
  try {
    const response = await fetch(`${DATA_BASE.replace(/\/+$/, '')}/projects.json`);
    if (!response.ok) return [DEFAULT_PROJECT];
    const payload = (await response.json()) as ProjectIndex;
    const projects = Array.isArray(payload?.projects)
      ? payload.projects.filter((p): p is ProjectInfo => !!p && typeof p.id === 'string')
      : [];
    return projects.length ? projects : [DEFAULT_PROJECT];
  } catch {
    return [DEFAULT_PROJECT];
  }
}
