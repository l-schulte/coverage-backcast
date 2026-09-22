"""Streaming LCOV parser.

Only the summary records (`LF/LH`, `BRF/BRH`, `FNF/FNH`) are needed for
file-level coverage, but `DA`/`FNDA` are counted as a fallback for records
that omit summaries.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


@dataclass(slots=True)
class FileCoverage:
    path: str
    lf: int
    lh: int
    brf: int
    brh: int
    fnf: int
    fnh: int


def _to_int(value: str) -> int:
    try:
        return int(value)
    except ValueError:
        return 0


def parse_lcov(path: str | Path) -> Iterator[FileCoverage]:
    """Yield one ``FileCoverage`` per ``SF`` record in an LCOV file."""
    sf: str | None = None
    lf = lh = brf = brh = fnf = fnh = 0
    da_total = da_hit = fnda_total = fnda_hit = 0
    have_summary = False

    def reset() -> None:
        nonlocal lf, lh, brf, brh, fnf, fnh, da_total, da_hit, fnda_total, fnda_hit, have_summary
        lf = lh = brf = brh = fnf = fnh = 0
        da_total = da_hit = fnda_total = fnda_hit = 0
        have_summary = False

    def flush() -> FileCoverage:
        nonlocal lf, lh, fnf, fnh
        if not have_summary:
            lf, lh = da_total, da_hit
            if not fnf:
                fnf, fnh = fnda_total, fnda_hit
        return FileCoverage(sf, lf, lh, brf, brh, fnf, fnh)

    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            if raw.startswith("SF:"):
                if sf is not None:
                    yield flush()
                sf = raw[3:].rstrip("\r\n")
                reset()
            elif sf is None:
                continue
            elif raw.startswith("DA:"):
                parts = raw[3:].split(",")
                da_total += 1
                if len(parts) > 1 and _to_int(parts[1]) > 0:
                    da_hit += 1
            elif raw.startswith("LF:"):
                lf = _to_int(raw[3:].strip())
                have_summary = True
            elif raw.startswith("LH:"):
                lh = _to_int(raw[3:].strip())
            elif raw.startswith("BRF:"):
                brf = _to_int(raw[4:].strip())
            elif raw.startswith("BRH:"):
                brh = _to_int(raw[4:].strip())
            elif raw.startswith("FNF:"):
                fnf = _to_int(raw[4:].strip())
            elif raw.startswith("FNH:"):
                fnh = _to_int(raw[4:].strip())
            elif raw.startswith("FNDA:"):
                parts = raw[5:].split(",")
                fnda_total += 1
                if len(parts) > 1 and _to_int(parts[1]) > 0:
                    fnda_hit += 1
            elif raw.startswith("end_of_record"):
                if sf is not None:
                    yield flush()
                sf = None

    if sf is not None:
        yield flush()
