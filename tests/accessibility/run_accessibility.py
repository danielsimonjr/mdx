#!/usr/bin/env python3
"""Accessibility conformance runner (scaffold).

Runs structural accessibility checks on fixture markdown files. This is a
minimum-viable runner that can execute today without a headless browser —
it parses the markdown and checks for known-bad patterns (missing alt text,
heading-order violations, vague link text). Phase 3.3 replaces this with
a full Playwright + axe-core runner against the rendered `<mdz-viewer>`
output.

What the current runner catches:
  - Images without alt text            (WCAG 1.1.1 Non-text Content)
  - Heading levels that skip           (WCAG 2.4.10 Section Headings)
  - Vague link text ("click here" etc) (WCAG 2.4.4 Link Purpose)
  - Missing lang attribute on archive  (WCAG 3.1.1 Language of Page)

What it DOESN'T catch (needs real browser):
  - Color contrast                     (WCAG 1.4.3)
  - Keyboard navigation                (WCAG 2.1.1)
  - Focus visible                      (WCAG 2.4.7)
  - ARIA correctness                   (WCAG 4.1.2)

Exit 0 if all fixtures match expectations; 1 otherwise.
"""

from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

FIXTURES = Path(__file__).resolve().parent / "fixtures"


VAGUE_LINK_TEXTS = {
    "click here",
    "here",
    "read more",
    "more",
    "link",
    "this link",
    "click",
}


def check_markdown(md: str, manifest: dict) -> list[dict]:
    """Run structural accessibility checks; return list of violations.

    Each violation is a dict with `rule`, `wcag`, `message`, and `line`.
    """
    violations: list[dict] = []
    lines = md.splitlines()

    # 1. Image alt text — markdown `![alt](src)` with empty alt is a violation.
    for i, line in enumerate(lines, start=1):
        for m in re.finditer(r"!\[([^\]]*)\]\(([^)]+)\)", line):
            alt = m.group(1).strip()
            src = m.group(2).strip()
            if not alt:
                violations.append({
                    "rule": "image-alt",
                    "wcag": "1.1.1",
                    "message": f"image {src!r} has empty alt text",
                    "line": i,
                })

    # 2. Heading order — sequential levels; h1->h3 is a violation.
    last_level = 0
    for i, line in enumerate(lines, start=1):
        m = re.match(r"^(#{1,6})\s+", line)
        if not m:
            continue
        level = len(m.group(1))
        if last_level > 0 and level > last_level + 1:
            violations.append({
                "rule": "heading-order",
                "wcag": "2.4.10",
                "message": f"heading level {level} follows level {last_level} (skipped levels)",
                "line": i,
            })
        last_level = level

    # 3. Vague link text — [click here](url) is a violation.
    for i, line in enumerate(lines, start=1):
        for m in re.finditer(r"\[([^\]]+)\]\(([^)]+)\)", line):
            label = m.group(1).strip().lower()
            if label in VAGUE_LINK_TEXTS:
                violations.append({
                    "rule": "link-name",
                    "wcag": "2.4.4",
                    "message": f"vague link text {label!r}; link purpose unclear out of context",
                    "line": i,
                })

    # 4. Language declaration — manifest.document.language is required.
    doc = manifest.get("document", {})
    if not doc.get("language"):
        violations.append({
            "rule": "document-language",
            "wcag": "3.1.1",
            "message": "manifest.document.language is not set",
            "line": 0,
        })

    return violations


def default_manifest() -> dict:
    return {
        "mdx_version": "2.0.0",
        "document": {
            "id": "00000000-0000-4000-8000-000000000000",
            "title": "Fixture",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
            "language": "en-US",
        },
        "content": {"entry_point": "document.md"},
    }


def run_fixture(fixture_dir: Path) -> tuple[bool, list[str]]:
    """Returns (ok, messages)."""
    input_path = fixture_dir / "input.md"
    if not input_path.exists():
        return False, [f"{fixture_dir.name}: missing input.md"]

    manifest_path = fixture_dir / "manifest.json"
    manifest = (
        json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest_path.exists()
        else default_manifest()
    )

    expected_path = fixture_dir / "expected.json"
    if not expected_path.exists():
        return False, [f"{fixture_dir.name}: missing expected.json"]
    expected = json.loads(expected_path.read_text(encoding="utf-8"))

    md = input_path.read_text(encoding="utf-8")
    violations = check_markdown(md, manifest)
    violation_rules = sorted({v["rule"] for v in violations})

    expected_rules = sorted(expected.get("expected_violations", []))
    if violation_rules != expected_rules:
        return False, [
            f"{fixture_dir.name}: violations differ",
            f"  expected: {expected_rules}",
            f"  got:      {violation_rules}",
            *[f"    {v['rule']} (line {v['line']}): {v['message']}" for v in violations],
        ]

    return True, [f"{fixture_dir.name}: {len(violations)} violations ({violation_rules})"]


def main() -> int:
    if not FIXTURES.exists():
        print(f"  [SKIP] no fixtures directory at {FIXTURES}")
        print("         (Phase 3.3 scaffold — fixtures are added incrementally)")
        return 0

    fixture_dirs = sorted(d for d in FIXTURES.iterdir() if d.is_dir())
    if not fixture_dirs:
        print("  [SKIP] fixtures directory is empty")
        return 0

    passed = 0
    failed: list[str] = []
    for d in fixture_dirs:
        ok, messages = run_fixture(d)
        if ok:
            for msg in messages:
                print(f"  [PASS] {msg}")
            passed += 1
        else:
            for msg in messages:
                print(f"  [FAIL] {msg}")
            failed.append(d.name)

    print()
    print(f"  Passed: {passed}/{len(fixture_dirs)}")
    if failed:
        print(f"  Failed: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
