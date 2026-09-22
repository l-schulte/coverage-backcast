import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const dataDir = resolve(__dirname, '..', 'data');

const MIME: Record<string, string> = {
  '.parquet': 'application/vnd.apache.parquet',
  '.json': 'application/json',
  '.duckdb': 'application/octet-stream',
};

/** Serve the generated ./data directory at /data during `vite dev`. */
function serveData(): Plugin {
  return {
    name: 'backcast-serve-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
        const file = join(dataDir, rel);
        if (!file.startsWith(dataDir) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        const size = statSync(file).size;
        const type = MIME[extname(file)] ?? 'application/octet-stream';
        const range = req.headers.range;
        if (range) {
          const match = /bytes=(\d+)-(\d*)/.exec(range);
          const start = match ? Number(match[1]) : 0;
          const end = match && match[2] ? Number(match[2]) : size - 1;
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
          });
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), serveData()],
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
});
