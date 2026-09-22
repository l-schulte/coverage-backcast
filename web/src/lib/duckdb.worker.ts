/// <reference lib="webworker" />
import * as duckdb from '@duckdb/duckdb-wasm';

type Request =
  | { id: number; type: 'init' }
  | { id: number; type: 'load'; dataBase: string; files: string[] }
  | { id: number; type: 'query'; sql: string }
  | { id: number; type: 'close' };

type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

// Absolute URLs: the DuckDB worker is bootstrapped from a blob URL, so
// root-relative paths cannot be resolved against its base.
const asset = (path: string) => new URL(path, self.location.href).href;

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: asset('/duckdb/duckdb-mvp.wasm'),
    mainWorker: asset('/duckdb/duckdb-browser-mvp.worker.js'),
  },
  eh: {
    mainModule: asset('/duckdb/duckdb-eh.wasm'),
    mainWorker: asset('/duckdb/duckdb-browser-eh.worker.js'),
  },
};

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
const registered = new Set<string>();

function plain(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (Array.isArray(value)) {
    return value.map(plain);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = plain(v);
    return out;
  }
  return value;
}

async function ensureDb(): Promise<duckdb.AsyncDuckDBConnection> {
  if (conn) return conn;
  const bundle = await duckdb.selectBundle(BUNDLES);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  conn = await db.connect();
  return conn;
}

async function loadFiles(dataBase: string, files: string[]): Promise<string[]> {
  await ensureDb();
  const loaded: string[] = [];
  for (const name of files) {
    if (registered.has(name)) {
      loaded.push(name);
      continue;
    }
    const response = await fetch(`${dataBase}/${name}`);
    if (!response.ok) throw new Error(`failed to fetch ${name}: ${response.status}`);
    const buffer = await response.arrayBuffer();
    await db!.registerFileBuffer(name, new Uint8Array(buffer));
    registered.add(name);
    loaded.push(name);
  }
  return loaded;
}

async function query(sql: string): Promise<unknown[]> {
  const database = await ensureDb();
  const result = await database.query(sql);
  return result.toArray().map((row) => plain(row.toJSON()));
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, type } = event.data;
  const post = (message: Response) => self.postMessage(message);
  try {
    if (type === 'init') {
      await ensureDb();
      post({ id, ok: true, result: true });
    } else if (type === 'load') {
      const loaded = await loadFiles(event.data.dataBase, event.data.files);
      post({ id, ok: true, result: loaded });
    } else if (type === 'query') {
      const rows = await query(event.data.sql);
      post({ id, ok: true, result: rows });
    } else if (type === 'close') {
      await conn?.close();
      await db?.terminate();
      conn = null;
      db = null;
      registered.clear();
      post({ id, ok: true, result: true });
    }
  } catch (error) {
    post({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
