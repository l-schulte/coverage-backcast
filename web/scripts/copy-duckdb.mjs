import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pkg = resolve(root, 'node_modules/@duckdb/duckdb-wasm/dist');
const out = resolve(root, 'public/duckdb');

if (!existsSync(pkg)) {
  console.error('[copy-duckdb] @duckdb/duckdb-wasm not installed yet; skipping');
  process.exit(0);
}

mkdirSync(out, { recursive: true });
let copied = 0;
for (const name of readdirSync(pkg)) {
  if (/^duckdb-(mvp|eh)\.wasm$/.test(name) || /^duckdb-browser-(mvp|eh)\.worker\.js$/.test(name)) {
    cpSync(join(pkg, name), join(out, name));
    copied += 1;
  }
}
console.log(`[copy-duckdb] copied ${copied} file(s) to public/duckdb`);
if (copied < 4) {
  console.error('[copy-duckdb] expected 4 duckdb-wasm assets');
  process.exit(1);
}
