"""Build the DuckDB database and Parquet exports."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import duckdb
import pyarrow as pa

from .discover import CommitScan, discover
from .parser import parse_lcov

log = logging.getLogger("backcast.importer")

AUTO_THRESHOLD = 0.95
BATCH_SIZE = 250_000

COVERAGE_SCHEMA = pa.schema(
    [
        ("commit_id", pa.int32()),
        ("suite", pa.string()),
        ("path", pa.string()),
        ("lf", pa.int32()),
        ("lh", pa.int32()),
        ("brf", pa.int32()),
        ("brh", pa.int32()),
        ("fnf", pa.int32()),
        ("fnh", pa.int32()),
        ("year", pa.int32()),
    ]
)


def _insert_commits(con: duckdb.DuckDBPyConnection, commits: list[CommitScan]) -> None:
    con.execute(
        """
        CREATE TABLE commits (
            commit_id INTEGER PRIMARY KEY,
            prefix    VARCHAR,
            sha       VARCHAR,
            ts        BIGINT,
            year      INTEGER,
            status    VARCHAR
        )
        """
    )
    con.execute(
        """
        CREATE TABLE commit_suites (
            commit_id INTEGER,
            suite     VARCHAR,
            exit_code INTEGER
        )
        """
    )

    commit_rows = [
        (c.commit_id, c.prefix, c.sha, c.ts, c.year, c.status) for c in commits
    ]
    con.executemany("INSERT INTO commits VALUES (?, ?, ?, ?, ?, ?)", commit_rows)

    suite_rows: list[tuple[int, str, int | None]] = []
    for commit in commits:
        for suite in commit.suites.values():
            suite_rows.append((commit.commit_id, suite.name, suite.exit_code))
    if suite_rows:
        con.executemany("INSERT INTO commit_suites VALUES (?, ?, ?)", suite_rows)


def _insert_coverage(con: duckdb.DuckDBPyConnection, commits: list[CommitScan]) -> int:
    con.execute(
        """
        CREATE TABLE coverage (
            commit_id INTEGER,
            suite     VARCHAR,
            path      VARCHAR,
            lf        INTEGER,
            lh        INTEGER,
            brf       INTEGER,
            brh       INTEGER,
            fnf       INTEGER,
            fnh       INTEGER,
            year      INTEGER
        )
        """
    )
    cols: dict[str, list] = {name: [] for name in COVERAGE_SCHEMA.names}
    total_files = 0
    total_records = 0
    started = time.time()

    def flush() -> None:
        table = pa.table(cols, schema=COVERAGE_SCHEMA)
        con.register("_batch", table)
        con.execute("INSERT INTO coverage SELECT * FROM _batch")
        con.unregister("_batch")
        for values in cols.values():
            values.clear()

    for index, commit in enumerate(commits, start=1):
        for suite in commit.suites.values():
            if suite.lcov_path is None:
                continue
            total_files += 1
            for record in parse_lcov(suite.lcov_path):
                cols["commit_id"].append(commit.commit_id)
                cols["suite"].append(suite.name)
                cols["path"].append(record.path)
                cols["lf"].append(record.lf)
                cols["lh"].append(record.lh)
                cols["brf"].append(record.brf)
                cols["brh"].append(record.brh)
                cols["fnf"].append(record.fnf)
                cols["fnh"].append(record.fnh)
                cols["year"].append(commit.year)
                total_records += 1
                if len(cols["path"]) >= BATCH_SIZE:
                    flush()
        if index % 250 == 0 or index == len(commits):
            elapsed = time.time() - started
            rate = index / elapsed if elapsed else 0
            log.info(
                "parsed %d/%d commits, %d files, %d records (%.0f commits/s)",
                index,
                len(commits),
                total_files,
                total_records,
                rate,
            )
    if cols["path"]:
        flush()
    return total_records


def _normalize_paths(
    con: duckdb.DuckDBPyConnection, strip: list[str] | None
) -> str | None:
    """Strip a common source-root prefix from stored paths.

    ``strip`` is an explicit list of prefixes (e.g. ``["/src"]``). When ``None``
    the dominant leading segment is detected automatically if it covers at
    least ``AUTO_THRESHOLD`` of all rows.
    """
    applied: list[str] = []

    con.execute(
        "UPDATE coverage SET path = '/' || "
        "ltrim(regexp_replace(replace(path, chr(92), '/'), '/+', '/', 'g'), '/') "
        "WHERE path <> ''"
    )

    if strip is None:
        total = con.execute("SELECT count(*) FROM coverage").fetchone()[0]
        if not total:
            return None
        row = con.execute(
            """
            SELECT split_part(path, '/', 2) AS segment, count(*) AS c
            FROM coverage
            WHERE path LIKE '/%'
            GROUP BY 1
            ORDER BY c DESC
            LIMIT 1
            """
        ).fetchone()
        if not row or not row[0]:
            return None
        segment, count = row
        if count / total >= AUTO_THRESHOLD:
            strip = [f"/{segment}"]

    if not strip:
        return None

    prefixes = sorted({p.rstrip("/") for p in strip if p and p != "/"}, key=len, reverse=True)
    for prefix in prefixes:
        con.execute(
            "UPDATE coverage SET path = substr(path, ?) WHERE path LIKE ?",
            [len(prefix) + 1, f"{prefix}/%"],
        )
        applied.append(prefix)
        log.info("stripped path prefix %s", prefix)
    return ", ".join(applied) if applied else None


def _build_summary(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        """
        CREATE TABLE summary AS
        SELECT commit_id, suite,
               CAST(sum(lf) AS BIGINT) AS lf, CAST(sum(lh) AS BIGINT) AS lh,
               CAST(sum(brf) AS BIGINT) AS brf, CAST(sum(brh) AS BIGINT) AS brh,
               CAST(sum(fnf) AS BIGINT) AS fnf, CAST(sum(fnh) AS BIGINT) AS fnh
        FROM coverage
        GROUP BY commit_id, suite
        """
    )


def _export(con: duckdb.DuckDBPyConnection, out: Path) -> None:
    comp = "COMPRESSION zstd"
    con.execute(
        f"COPY (SELECT commit_id, suite, path, lf, lh, brf, brh, fnf, fnh, year "
        f"FROM coverage ORDER BY commit_id) "
        f"TO '{out / 'coverage.parquet'}' (FORMAT PARQUET, {comp})"
    )
    con.execute(
        f"COPY (SELECT * FROM commits ORDER BY commit_id) "
        f"TO '{out / 'commits.parquet'}' (FORMAT PARQUET, {comp})"
    )
    con.execute(
        f"COPY (SELECT * FROM commit_suites ORDER BY commit_id) "
        f"TO '{out / 'commit_suites.parquet'}' (FORMAT PARQUET, {comp})"
    )
    con.execute(
        f"COPY (SELECT * FROM summary ORDER BY commit_id) "
        f"TO '{out / 'summary.parquet'}' (FORMAT PARQUET, {comp})"
    )


def _write_meta(
    out: Path, commits: list[CommitScan], suite_names: list[str], stripped: str | None, records: int
) -> None:
    timestamps = [c.ts for c in commits]
    meta = {
        "generated_at": int(time.time()),
        "commit_count": len(commits),
        "coverage_records": records,
        "suites": suite_names,
        "statuses": {},
        "prefix_stripped": stripped,
        "first_ts": min(timestamps) if timestamps else None,
        "last_ts": max(timestamps) if timestamps else None,
    }
    for commit in commits:
        meta["statuses"][commit.status] = meta["statuses"].get(commit.status, 0) + 1
    (out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


def build(
    root: str | Path,
    out: str | Path,
    *,
    strip: list[str] | None = None,
    include_gaps: bool = True,
    db_name: str = "coverage.duckdb",
) -> dict:
    """Run the full import. Returns the metadata dict written to ``meta.json``."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)

    log.info("discovering runs in %s", root)
    commits = discover(root, include_gaps=include_gaps)
    if not commits:
        raise RuntimeError(f"no coverage runs found in {root}")
    with_coverage = sum(1 for c in commits if c.suites)
    log.info(
        "found %d commits (%d with coverage, %d gaps)",
        len(commits),
        with_coverage,
        len(commits) - with_coverage,
    )

    db_path = out / db_name
    if db_path.exists():
        db_path.unlink()
    con = duckdb.connect(str(db_path))
    try:
        con.execute("PRAGMA threads=4")
        _insert_commits(con, commits)
        records = _insert_coverage(con, commits)
        stripped = _normalize_paths(con, strip)
        _build_summary(con)
        _export(con, out)
        suite_names = sorted(
            {s.name for c in commits for s in c.suites.values()}
        )
        _write_meta(out, commits, suite_names, stripped, records)
    finally:
        con.close()

    meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
    log.info(
        "done: %d commits, %d records, suite(s)=%s, stripped=%s",
        meta["commit_count"],
        meta["coverage_records"],
        meta["suites"],
        meta["prefix_stripped"],
    )
    return meta
