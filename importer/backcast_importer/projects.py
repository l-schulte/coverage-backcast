"""Project index (``data/projects.json``) helpers.

The data directory can hold multiple independent projects, each in its own
subfolder (``data/<project>/``). A top-level ``projects.json`` lists them so the
static web app can enumerate projects without a directory listing.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

INDEX_NAME = "projects.json"
NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_name(name: str) -> str:
    """Validate a project id used as a directory name and URL path segment."""
    name = (name or "").strip()
    if not name or name in (".", "..") or not NAME_RE.match(name):
        raise ValueError(
            f"invalid project name {name!r}: use letters, digits, '.', '_' or '-'"
        )
    return name


def index_path(data_dir: str | Path) -> Path:
    return Path(data_dir) / INDEX_NAME


def read_index(data_dir: str | Path) -> list[dict]:
    path = index_path(data_dir)
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    projects = payload.get("projects") if isinstance(payload, dict) else None
    return projects if isinstance(projects, list) else []


def update_index(data_dir: str | Path, entry: dict) -> list[dict]:
    """Insert or replace a project entry, persisting the index sorted by id."""
    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    projects = [p for p in read_index(data_dir) if p.get("id") != entry.get("id")]
    projects.append(entry)
    projects.sort(key=lambda p: p.get("id", ""))
    payload = {"projects": projects}
    index_path(data_dir).write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )
    return projects
