# Coverage Backcast

Interactive circle-packing visualization of code coverage over time. The
hierarchy is derived from file paths, circle **size** is the number of lines,
and circle **color** is coverage. A timeline lets you scrub or play through
years of history.

The tool is deliberately split into two pieces:

1. **importer** — a small Python CLI that parses raw LCOV runs into a compact
   columnar database (DuckDB + Parquet).
2. **web** — a static Svelte + TypeScript app that queries that database
   **entirely in the browser** with [DuckDB-WASM]. No backend is required.

```
coverage/
  1713203675_8df959c9.../    # a run directory
      unit.lcov
      unit.exit_code
      integration.lcov       # any number of <suite>.lcov / .exit_code pairs
      integration.exit_code
  1714016075_a4f99514...error        # execution failed (gap)
  1714016075_a4f99514...not_applicable

        │  importer (Python, offline, one-shot)
        ▼
data/
  projects.json            # index of projects (multi-project mode)
  <project>/
    coverage.parquet       # one row per (commit, suite, file)
    commits.parquet        # commit metadata + status
    commit_suites.parquet  # suite exit codes per commit
    summary.parquet        # per-commit / per-suite totals
    meta.json
    coverage.duckdb        # same data, for ad-hoc SQL

        │  static SPA (Svelte + D3 + DuckDB-WASM)
        ▼
  circle packing + timeline, 100% client-side
```

## Data model

| status            | meaning                                                     |
| ----------------- | ----------------------------------------------------------- |
| `ok`              | LCOV present, all suites exited 0                           |
| `tests_failed`    | LCOV present, at least one suite exited non-zero            |
| `error`           | execution failed, no coverage (rendered as a **gap**)       |
| `not_applicable`  | run not applicable, no coverage (rendered as a **gap**)     |

Path handling is robust to history drift: leading slashes and `\` separators
are normalized, and a common source root is stripped automatically (`auto`),
or explicitly (`--prefix-strip /src,/app`), or disabled (`none`).

## Quick start

### Local (no containers)

```bash
# 1. import coverage  ->  ./data
python3 -m venv importer/.venv
importer/.venv/bin/pip install -r importer/requirements.txt
importer/.venv/bin/python -m backcast_importer \
    --coverage ./coverage --out ./data --verify

# 2. run the web app
cd web
npm install
npm run dev            # http://localhost:5173
```

The dev server mounts `./data` at `/data` automatically.

### Podman / Docker (compose)

```bash
# import once (writes ./data)
podman compose run --rm importer

# import a named project (organise sources as ./coverage/<project>)
podman compose run --rm importer \
  --coverage /coverage/frontend --out /data --name frontend

# production build: static SPA + data on nginx
podman compose up -d web           # http://localhost:8080

# or run the dev server with HMR
podman compose --profile dev up dev   # http://localhost:5173
```

`podman compose` (or `docker compose`) is supported; plain `podman build` also
works:

```bash
podman build -f containerfiles/importer.Containerfile -t backcast-importer .
podman run --rm -v ./coverage:/coverage:ro -v ./data:/data backcast-importer
```

## Importer CLI

```
python -m backcast_importer -c <coverage dir> -o <out dir> [options]

  -c, --coverage      root directory with timestamp_commitsha run folders
  -o, --out           output directory (default /data)
  -n, --name          project id; writes to <out>/<name> and updates projects.json
      --prefix-strip  'auto' (default) | 'none' | comma-separated prefixes
      --skip-gaps     omit error / not_applicable commits
      --verify        print a summary after import
```

The importer streams every `.lcov` file, so 6k+ runs / multi-GB inputs import
in minutes. It is idempotent — rerunning replaces the database.

### Multiple projects

Pass `--name` to write a self-contained dataset to `data/<name>/` and record it
in `data/projects.json`. Run the importer once per project; each run adds or
replaces its own entry in the index:

```bash
python -m backcast_importer -c ./coverage/frontend -o ./data --name frontend
python -m backcast_importer -c ./coverage/backend  -o ./data --name backend
```

Omitting `--name` keeps the original flat layout (files directly in `-o`). The
web app auto-detects that layout when `projects.json` is missing, so existing
datasets keep working unchanged.

## Web app

- **Size** = lines found (`lf`); **color** = selected coverage metric
  (lines / branches / functions, `hit / total`).
- **Zone** = file path hierarchy (directories contain their files).
- **Timeline** = brushable coverage-over-time chart with red ticks for gaps;
  press play to animate through history. Neighbouring commits are prefetched so
  playback stays smooth.
- **Interaction** = hover for metrics, click a directory to zoom in, click the
  background or breadcrumb to zoom out.
- **Suite selector** = one suite at a time, or `combined (approx.)`, which
  merges suites with `max(hits)` per file (exact union of hit lines is not
  recoverable from file-level aggregates).
- **Project selector** = when `data/projects.json` lists more than one project,
  a dropdown switches between them. The choice is stored in the URL hash
  (`#project=<id>`) so links are shareable; with a single project (or the legacy
  flat layout) the selector is hidden.

Configuration: set `VITE_DATA_BASE` to point at a non-default data path
(default `/data`).

## Development

```bash
cd web
npm run check          # svelte-check + TypeScript
npm run build          # production bundle + copies DuckDB WASM assets
```

```bash
cd importer
importer/.venv/bin/python -m unittest discover -s tests
```

### Repository layout

```
importer/backcast_importer/   parser, discovery, DuckDB/Parquet builder, CLI
importer/tests/              importer unit tests
web/src/lib/                 duckdb worker/client, layout, renderer, state
web/src/components/          canvas, timeline, controls, details, legend
containerfiles/              importer, web (nginx), dev images
compose.yaml                 importer / web / dev services
```

[DuckDB-WASM]: https://duckdb.org/docs/api/wasm/overview
