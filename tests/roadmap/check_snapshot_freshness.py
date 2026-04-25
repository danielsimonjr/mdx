#!/usr/bin/env python3
"""Assert the ROADMAP `### Status snapshot (YYYY-MM-DD)` date is fresh.

Phase 4.6.9 CI gate. Compares the date in the snapshot heading
against the latest commit timestamp on `ROADMAP.md`. Catches the
"snapshot table claims 2026-04-24 but the file's most recent commit
is 2026-04-25" drift this session's cross-check found.

Threshold: 30 days. The snapshot is a manually-maintained summary;
forcing a rewrite on every commit would be noisy. 30 days lets a
maintainer batch-up small changes; anything older almost certainly
needs review.

Run from repo root:

    python tests/roadmap/check_snapshot_freshness.py
    python tests/roadmap/check_snapshot_freshness.py --max-days 7  # tighter

Exit 0 on fresh, 1 on stale (with the offending date + max age in
days), 2 on parse failure.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SNAPSHOT_PAT = re.compile(r"### Status snapshot \((\d{4}-\d{2}-\d{2})\)")
DEFAULT_MAX_DAYS = 30


def repo_root() -> Path:
    here = Path(__file__).resolve()
    return here.parent.parent.parent


def parse_snapshot_date(roadmap_text: str) -> datetime | None:
    m = SNAPSHOT_PAT.search(roadmap_text)
    if not m:
        return None
    return datetime.strptime(m.group(1), "%Y-%m-%d").replace(tzinfo=timezone.utc)


def last_commit_date(file_path: Path) -> datetime | None:
    """Latest author-date for `file_path` per git log. UTC."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%aI", "--", str(file_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    iso = result.stdout.strip()
    if not iso:
        return None
    # `%aI` is strict ISO-8601 with timezone offset; Python parses it directly.
    return datetime.fromisoformat(iso).astimezone(timezone.utc)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--max-days",
        type=int,
        default=DEFAULT_MAX_DAYS,
        help=f"max staleness in days (default: {DEFAULT_MAX_DAYS})",
    )
    args = parser.parse_args()

    root = repo_root()
    roadmap_path = root / "ROADMAP.md"
    roadmap = roadmap_path.read_text(encoding="utf-8", errors="replace")

    snapshot_date = parse_snapshot_date(roadmap)
    if snapshot_date is None:
        print("ERROR: no `### Status snapshot (YYYY-MM-DD)` heading found in ROADMAP.md")
        return 2

    commit_date = last_commit_date(roadmap_path)
    # Use commit date as the reference if available, otherwise wall clock.
    # CI runs on a fresh checkout where the commit date is the right
    # signal; locally `today` is fine.
    reference = commit_date or datetime.now(timezone.utc)

    age_days = (reference - snapshot_date).days
    print(f"Snapshot heading date:  {snapshot_date.date()}")
    print(f"Reference (commit date if available, else now): {reference.date()}")
    print(f"Age:                    {age_days} day(s)")
    print(f"Max allowed:            {args.max_days} day(s)")

    if age_days > args.max_days:
        print(
            f"\nFAIL: snapshot is {age_days} days old; max allowed is {args.max_days}.",
            "Update the `### Status snapshot (YYYY-MM-DD)` heading + table contents "
            "to reflect current state.",
        )
        return 1
    print("\nFresh. ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
