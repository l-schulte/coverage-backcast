"""Discovery of coverage runs on disk.

Layout produced by the collection tooling::

    <root>/
      1713203675_8df959c9.../            # successful run dir
          unit.lcov
          unit.exit_code
          integration.lcov               # other datasets may add suites
          integration.exit_code
      1714016075_a4f99514....error        # execution failed (no coverage)
      1714016075_a4f99514....not_applicable

A run directory may contain any number of ``<suite>.lcov`` / ``<suite>.exit_code``
pairs. Coverage is considered present whenever at least one ``.lcov`` file
exists, regardless of the recorded exit codes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

RUN_RE = re.compile(r"^(?P<ts>\d+)_(?P<sha>[0-9a-fA-F]+)(?:\.(?P<marker>error|not_applicable))?$")

STATUS_OK = "ok"
STATUS_TESTS_FAILED = "tests_failed"
STATUS_ERROR = "error"
STATUS_NOT_APPLICABLE = "not_applicable"


@dataclass(slots=True)
class SuiteScan:
    name: str
    lcov_path: Path | None
    exit_code: int | None


@dataclass(slots=True)
class CommitScan:
    prefix: str
    ts: int
    sha: str
    status: str
    suites: dict[str, SuiteScan] = field(default_factory=dict)
    commit_id: int = -1

    @property
    def year(self) -> int:
        return datetime.fromtimestamp(self.ts, tz=timezone.utc).year


def _read_exit_code(path: Path) -> int | None:
    try:
        return int(path.read_text(encoding="utf-8", errors="replace").strip())
    except (OSError, ValueError):
        return None


def _collect_dir(run_dir: Path, commit: CommitScan) -> None:
    for child in run_dir.iterdir():
        if not child.is_file():
            continue
        if child.suffix == ".lcov":
            suite = child.stem
            commit.suites.setdefault(suite, SuiteScan(suite, None, None)).lcov_path = child
        elif child.name.endswith(".exit_code"):
            suite = child.name[: -len(".exit_code")]
            commit.suites.setdefault(suite, SuiteScan(suite, None, None)).exit_code = _read_exit_code(child)


def discover(root: str | Path, *, include_gaps: bool = True) -> list[CommitScan]:
    """Return all runs found under ``root`` sorted by ``(timestamp, sha)``."""
    root = Path(root)
    if not root.is_dir():
        raise FileNotFoundError(f"coverage directory not found: {root}")

    commits: dict[str, CommitScan] = {}
    markers: dict[str, set[str]] = {}

    def commit_for(prefix: str, ts: int, sha: str) -> CommitScan:
        return commits.setdefault(prefix, CommitScan(prefix=prefix, ts=ts, sha=sha, status=STATUS_OK))

    for entry in sorted(root.iterdir()):
        if entry.name.startswith("."):
            continue
        match = RUN_RE.match(entry.name)
        if not match:
            continue
        ts = int(match.group("ts"))
        sha = match.group("sha")
        marker = match.group("marker")

        if entry.is_dir():
            commit = commit_for(entry.name, ts, sha)
            _collect_dir(entry, commit)
        elif marker:
            markers.setdefault(entry.name[: -(len(marker) + 1)], set()).add(marker)

    for prefix, marks in markers.items():
        commit = commits.get(prefix)
        if commit is None:
            match = RUN_RE.match(prefix)
            if not match:
                continue
            commit = commit_for(prefix, int(match.group("ts")), match.group("sha"))
        if not commit.suites:
            commit.status = STATUS_ERROR if "error" in marks else STATUS_NOT_APPLICABLE
        elif "error" in marks:
            commit.status = STATUS_ERROR

    for commit in commits.values():
        if commit.status == STATUS_OK and commit.suites:
            exit_codes = [s.exit_code for s in commit.suites.values() if s.exit_code is not None]
            if any(code != 0 for code in exit_codes):
                commit.status = STATUS_TESTS_FAILED

    result = list(commits.values())
    if not include_gaps:
        result = [c for c in result if c.suites]
    result.sort(key=lambda c: (c.ts, c.sha))
    for idx, commit in enumerate(result):
        commit.commit_id = idx
    return result
