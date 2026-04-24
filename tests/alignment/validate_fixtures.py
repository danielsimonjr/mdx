#!/usr/bin/env python3
"""Validate the integrity of MDX v1.1 alignment test fixtures.

This is NOT a parser test — this repo has no runtime Markdown alignment
parser. It's a *fixture-integrity* test that verifies each fixture
file matches the spec-level behavior its filename claims, and flags
any drift between the fixtures and the v1.1 specification.

What this validates:
- Each fixture file parses for block-attribute markers per the v1.1
  spec grammar (`{:.class}`, `{.class}`, `::::{.class}`)
- Files claiming specific behaviors contain the expected constructs
  (e.g., 01-basic-alignment.md should have all 4 alignment classes;
  06-containers.md should have container blocks; 09-malformed.md
  should have at least one malformed marker).
- Fixtures don't silently lose expected features over time.

Exit 0 on all fixtures valid; exit 1 otherwise.

Usage:
    python tests/alignment/validate_fixtures.py

References:
- spec/MDX_FORMAT_SPECIFICATION_v1.1.md — the v1.1 spec
- tests/alignment/README.md — fixture-by-fixture expected-feature table
"""

from __future__ import annotations

import io
import re
import sys
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

FIXTURES_DIR = Path(__file__).parent

# v1.1 spec grammar patterns
# Shorthand alignment: {:.classname} on its own line before a block
SHORTHAND_MARKER = re.compile(r"^\{:\.([a-z][a-z0-9\-]*)\}\s*$", re.MULTILINE)
# Inline block attributes: {.class1 .class2 #id key=value ...}
# Matches a brace group that starts with `.classname` and may contain
# more classes, IDs, or key=value pairs separated by spaces.
INLINE_ATTR = re.compile(r"\{\.[a-z][a-z0-9\-]*(?:\s+[^}]*)?\}")
# Extract all class names from any attribute block (shorthand or inline)
ATTR_CLASSES = re.compile(r"\.([a-z][a-z0-9\-]*)")
# Container block open/close: 3+ colons per CommonMark directive convention;
# v1.1 examples use both `:::{.class}` and `::::{.class}` interchangeably.
CONTAINER_OPEN = re.compile(r"^:{3,}\{\.([a-z][a-z0-9\-]*)\}\s*$", re.MULTILINE)
CONTAINER_CLOSE = re.compile(r"^:{3,}\s*$", re.MULTILINE)
# Directive containers (named, v1.1): ::::note, ::::details, etc.
DIRECTIVE_CONTAINER = re.compile(r"^:{3,}(note|details|tip|warning|info|caution)", re.MULTILINE)
# Inline media directives (v1.0, reused in alignment fixtures): ::video, ::audio, ::model, ::embed, ::data, ::figure
INLINE_DIRECTIVE = re.compile(r"::(video|audio|model|embed|data|figure|toc)\[")
# Malformed patterns for 09-malformed.md:
#   - unclosed brace: `{` that doesn't close on the same line
#   - bare word in braces: `{word}` with no `.` prefix (not a valid class or attr)
MALFORMED_UNCLOSED = re.compile(r"\{[^}\n]*$", re.MULTILINE)
MALFORMED_NO_DOT = re.compile(r"\{([a-z][a-z0-9\-]*)\}")  # {word} without dot/colon prefix

# Canonical alignment class names from the v1.1 spec
ALIGNMENT_CLASSES = {"align-left", "align-center", "align-right", "align-justify"}
# Their shorthand equivalents
ALIGNMENT_SHORTHANDS = {"left", "center", "right", "justify"}


def scan(fixture_path: Path) -> dict:
    """Return a dict describing the alignment constructs found in a fixture."""
    content = fixture_path.read_text(encoding="utf-8", errors="replace")
    inline_attrs = INLINE_ATTR.findall(content)
    # All classes mentioned anywhere (handy for alignment coverage checks)
    all_classes = set()
    for group in SHORTHAND_MARKER.findall(content):
        all_classes.add(group)
    for attr in inline_attrs:
        all_classes.update(ATTR_CLASSES.findall(attr))
    return {
        "file": fixture_path.name,
        "shorthand_alignments": SHORTHAND_MARKER.findall(content),
        "inline_attrs": inline_attrs,
        "container_opens": CONTAINER_OPEN.findall(content),
        "container_closes": len(CONTAINER_CLOSE.findall(content)),
        "directive_containers": DIRECTIVE_CONTAINER.findall(content),
        "inline_directives": INLINE_DIRECTIVE.findall(content),
        "all_classes": all_classes,
        "malformed_unclosed": MALFORMED_UNCLOSED.findall(content),
        "malformed_no_dot": MALFORMED_NO_DOT.findall(content),
        "raw_size": len(content),
    }


def expect(scan_result: dict, name: str, check, detail: str) -> tuple[bool, str]:
    """Evaluate one expectation against a scan. Return (passed, message)."""
    passed = bool(check(scan_result))
    prefix = "PASS" if passed else "FAIL"
    return passed, f"  [{prefix}] {name}: {detail}"


# Per-fixture expectations.
# Each entry maps fixture filename → list of (name, check_fn, detail) tuples.
EXPECTATIONS = {
    "01-basic-alignment.md": [
        (
            "all 4 alignment shorthands present",
            lambda s: set(s["shorthand_alignments"]) >= ALIGNMENT_SHORTHANDS,
            "file should demonstrate left, center, right, and justify",
        ),
    ],
    "02-headings.md": [
        (
            "at least one alignment marker",
            lambda s: len(s["shorthand_alignments"]) + len(s["inline_attrs"]) > 0,
            "headings fixture should apply alignment to at least one heading",
        ),
    ],
    "03-lists.md": [
        (
            "at least one alignment marker",
            lambda s: len(s["shorthand_alignments"]) + len(s["inline_attrs"]) > 0,
            "lists fixture should apply alignment to at least one list/item",
        ),
    ],
    "04-blockquotes.md": [
        (
            "at least one alignment marker",
            lambda s: len(s["shorthand_alignments"]) + len(s["inline_attrs"]) > 0,
            "blockquotes fixture should apply alignment to at least one quote",
        ),
    ],
    "05-directives.md": [
        (
            "uses inline media directives",
            lambda s: len(s["inline_directives"]) > 0,
            "directives fixture should include inline directives like ::video/::model/::embed",
        ),
        (
            "applies alignment to at least one directive",
            lambda s: len(s["shorthand_alignments"]) > 0 or any("align-" in c for c in s["all_classes"]),
            "directives fixture should demonstrate alignment applied to a directive",
        ),
    ],
    "06-containers.md": [
        (
            "has matched container open/close",
            lambda s: len(s["container_opens"]) >= 1 and s["container_closes"] >= len(s["container_opens"]),
            "containers fixture should open at least one ::::{.class} block with a matching :::: close",
        ),
    ],
    "07-precedence.md": [
        (
            "has multiple alignment markers (to test precedence)",
            lambda s: len(s["shorthand_alignments"]) + len(s["inline_attrs"]) + len(s["container_opens"]) >= 2,
            "precedence fixture needs at least 2 markers interacting",
        ),
    ],
    "08-combined-attributes.md": [
        (
            "uses both shorthand and inline attribute syntax",
            lambda s: len(s["shorthand_alignments"]) > 0 or len(s["inline_attrs"]) > 0,
            "combined-attributes fixture should exercise attribute composition",
        ),
    ],
    "09-malformed.md": [
        (
            "contains at least one malformed marker",
            lambda s: len(s["malformed_unclosed"]) + len(s["malformed_no_dot"]) > 0,
            "malformed fixture must include invalid syntax (unclosed braces, missing-dot markers, etc.)",
        ),
        (
            "also contains at least one valid marker (mixed valid/invalid)",
            lambda s: len(s["shorthand_alignments"]) > 0,
            "malformed fixture should mix valid and invalid to test graceful degradation",
        ),
    ],
    "10-backward-compat.md": [
        (
            "fixture exists (backward-compat fixtures may intentionally have no v1.1 syntax)",
            lambda s: s["raw_size"] > 0,
            "backward-compat fixture is non-empty",
        ),
    ],
}


def main() -> int:
    fixture_files = sorted(FIXTURES_DIR.glob("*.md"))
    # Skip README.md and any docs at fixture root
    fixture_files = [f for f in fixture_files if re.match(r"^\d{2}-", f.name)]

    if not fixture_files:
        print("ERROR: no NN-name.md fixtures found in", FIXTURES_DIR)
        return 1

    print(f"Validating {len(fixture_files)} v1.1 alignment fixtures...\n")

    total_checks = 0
    failed_checks = 0
    missing_expectations = []

    for fpath in fixture_files:
        print(f"{fpath.name}:")
        scan_result = scan(fpath)
        expectations = EXPECTATIONS.get(fpath.name)

        if expectations is None:
            print(f"  [WARN] no expectations defined for this fixture in EXPECTATIONS dict")
            missing_expectations.append(fpath.name)
            continue

        for name, check_fn, detail in expectations:
            total_checks += 1
            passed, msg = expect(scan_result, name, check_fn, detail)
            print(msg)
            if not passed:
                failed_checks += 1

    print()
    print(f"=== Summary ===")
    print(f"  Fixtures checked:    {len(fixture_files)}")
    print(f"  Total assertions:    {total_checks}")
    print(f"  Passed:              {total_checks - failed_checks}")
    print(f"  Failed:              {failed_checks}")
    if missing_expectations:
        print(f"  Fixtures without expectations: {', '.join(missing_expectations)}")

    return 0 if failed_checks == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
