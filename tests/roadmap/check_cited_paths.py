#!/usr/bin/env python3
"""Assert every cited path in a `[x]` ROADMAP entry resolves on disk.

Phase 4.6.9 CI gate. Reads `ROADMAP.md` from the repo root, walks
every `- [x]` entry, extracts each backtick-quoted string ending in
a recognised source extension, and asserts the path either exists
verbatim OR a file with the same basename exists somewhere in the
tree (citation-style tolerance). Exits non-zero with a per-failure
summary on drift.

This would have caught the `cli/test/import-ipynb.test.js` drift
fixed in commit 2b5be23 (the actual file is
`editor-desktop/test/ipynb-import.test.ts`).

Run from repo root:

    python tests/roadmap/check_cited_paths.py

Exit 0 on full pass, 1 on any unresolvable citation.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# Source extensions we treat as "must exist" — anything else (e.g.
# bare descriptive backticks like `mdz_version`) is left alone.
TRACKED_EXTS = {
    ".ts", ".tsx", ".js", ".py", ".rs", ".md", ".json",
    ".toml", ".yml", ".yaml", ".html", ".plist", ".abnf", ".lark",
}

# Directories we don't index (build outputs, deps, vcs).
SKIP_DIRS = {
    "node_modules", "dist", "dist-installers", "target", ".git",
    "__pycache__", ".rlm_cache", "example-extracted",
}

# Citation forms we deliberately ignore — they're examples, not
# pointers to specific files.
IGNORE_PATHS = {
    ".expected.json",         # fragment, not a real path
    "_v1.1.md",               # fragment of a multi-version reference
    "/viewer.js",              # served path, not a source file
}


def repo_root() -> Path:
    here = Path(__file__).resolve()
    # tests/roadmap/check_cited_paths.py → repo root is two levels up.
    return here.parent.parent.parent


def index_basenames(root: Path) -> dict[str, list[str]]:
    """Build a basename → posix-paths map of every tracked file."""
    out: dict[str, list[str]] = {}
    for f in root.rglob("*"):
        if not f.is_file():
            continue
        if any(part in SKIP_DIRS for part in f.parts):
            continue
        out.setdefault(f.name, []).append(f.relative_to(root).as_posix())
    return out


def extract_shipped_paths(roadmap_text: str) -> list[tuple[str, int]]:
    """Walk every `- [x]` entry; return (path, line_number) tuples.

    Line numbers are useful in the failure summary so a maintainer
    can jump to the offending entry. We track the line where the
    `[x]` marker appears, not the cited path's own line.
    """
    out: list[tuple[str, int]] = []
    item_pat = re.compile(r"^\s*-\s*\[x\]\s", re.MULTILINE)
    # Path-shaped strings only: no whitespace, no embedded backticks.
    # Earlier versions used `[^`]+` which matched multi-line shell
    # commands containing a path-shaped suffix; that's a false hit.
    path_pat = re.compile(
        r"`([^\s`]+\.(?:ts|tsx|js|py|rs|md|json|toml|yml|yaml|html|plist|abnf|lark))(?::\d+)?`"
    )

    # Walk one [x] entry at a time. An entry runs until the next
    # checkbox bullet OR a heading.
    matches = list(item_pat.finditer(roadmap_text))
    for i, m in enumerate(matches):
        start = m.end()
        # Find end of this entry.
        next_starts = [
            roadmap_text.find("\n- [", start),
            roadmap_text.find("\n  - [", start),
            roadmap_text.find("\n#", start),
        ]
        end_candidates = [n for n in next_starts if n > 0]
        end = min(end_candidates) if end_candidates else len(roadmap_text)
        body = roadmap_text[start:end]
        line_no = roadmap_text.count("\n", 0, m.start()) + 1
        for pm in path_pat.finditer(body):
            p = pm.group(1)
            if p in IGNORE_PATHS:
                continue
            # Drop URLs.
            if p.startswith(("http://", "https://")):
                continue
            # Drop globs / brace expansions / placeholders — these
            # aren't single paths.
            if any(c in p for c in "*<{}"):
                continue
            out.append((p, line_no))
    return out


def main() -> int:
    root = repo_root()
    roadmap = (root / "ROADMAP.md").read_text(encoding="utf-8", errors="replace")
    citations = extract_shipped_paths(roadmap)
    basenames = index_basenames(root)

    failures: list[tuple[str, int, str]] = []
    for path, line in citations:
        # Strip leading slash forms; they're just style.
        clean = path.lstrip("/")
        if (root / clean).exists():
            continue
        # Tolerate citation-by-basename: if a file with the same
        # basename exists anywhere in the tree, accept it. The
        # ROADMAP often cites bare filenames in narrative prose.
        base = clean.split("/")[-1]
        if base in basenames:
            continue
        failures.append((path, line, "unresolvable"))

    print(f"Citations checked: {len(citations)}")
    print(f"Resolved: {len(citations) - len(failures)}")
    print(f"Drifted: {len(failures)}")
    if failures:
        print()
        print("Drifted citations (the [x] entry claims a path that doesn't exist):")
        for path, line, reason in failures:
            print(f"  ROADMAP.md:{line:5d}  {path}  [{reason}]")
        return 1
    print("\nAll [x] citations resolve. ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
