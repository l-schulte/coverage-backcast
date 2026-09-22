"""Command line entry point for the coverage importer."""

from __future__ import annotations

import argparse
import logging
import sys

from .build import build

log = logging.getLogger("backcast.importer")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="backcast-importer",
        description="Import timestamped LCOV coverage runs into DuckDB + Parquet.",
    )
    parser.add_argument(
        "-c", "--coverage", required=True,
        help="Root directory containing the timestamp_commitsha run folders.",
    )
    parser.add_argument(
        "-o", "--out", default="/data",
        help="Output directory for coverage.duckdb and Parquet files (default: /data).",
    )
    parser.add_argument(
        "-n", "--name", default=None,
        help=(
            "Project id. Writes the dataset to <out>/<name> and updates the "
            "top-level projects.json index. Omit for the legacy flat layout."
        ),
    )
    parser.add_argument(
        "--prefix-strip", default="auto",
        help=(
            "Comma separated list of path prefixes to strip (e.g. '/src,/app'), "
            "'auto' to detect the dominant source root (default), or 'none' to keep "
            "paths untouched."
        ),
    )
    parser.add_argument(
        "--skip-gaps", action="store_true",
        help="Do not include failed / not-applicable commits as gaps.",
    )
    parser.add_argument(
        "--log-level", default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="Log level (default: INFO).",
    )
    parser.add_argument(
        "--verify", action="store_true",
        help="Print a short summary of the produced database and exit.",
    )
    return parser


def _parse_strip(value: str) -> list[str] | None:
    value = (value or "").strip()
    if value.lower() in ("", "auto"):
        return None
    if value.lower() == "none":
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    try:
        meta = build(
            args.coverage,
            args.out,
            strip=_parse_strip(args.prefix_strip),
            include_gaps=not args.skip_gaps,
            project=args.name,
        )
    except Exception as exc:  # noqa: BLE001 - surface a clean CLI error
        log.error("%s", exc)
        return 1

    if args.verify:
        print(
            f"project={meta.get('project') or '-'}, "
            f"{meta['commit_count']} commits, {meta['coverage_records']} records, "
            f"statuses={meta['statuses']}, suites={meta['suites']}, "
            f"stripped={meta['prefix_stripped']}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
