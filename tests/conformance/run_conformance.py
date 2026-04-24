#!/usr/bin/env python3
"""Conformance test runner for the MDZ reference parser.

Runs every `.md` fixture under tests/conformance/{positive,negative,roundtrip,edge}
and verifies the parser's output matches the paired `.expected.json` or
`.expected-error.json`.

Exit 0 on all passes; exit 1 with a summary on any failure.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "implementations" / "python"))

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from mdz_parser import parse, ParseError  # noqa: E402

FIXTURE_DIR = REPO_ROOT / "tests" / "conformance"
CATEGORIES = ["positive", "negative", "roundtrip", "edge"]


def _normalize_ast(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Serialize + reparse for stable comparison (drops set ordering, etc.)."""
    return json.loads(json.dumps(blocks, sort_keys=True))


def _run_positive(md_path: Path) -> tuple[bool, str]:
    expected_path = md_path.with_suffix(".expected.json")
    if not expected_path.exists():
        return False, f"missing {expected_path.name}"
    text = md_path.read_text(encoding="utf-8")
    expected = json.loads(expected_path.read_text(encoding="utf-8"))
    try:
        actual = parse(text)
    except ParseError as e:
        return False, f"unexpected ParseError: {e}"
    actual_n = _normalize_ast(actual)
    expected_n = _normalize_ast(expected)
    if actual_n != expected_n:
        return False, (
            f"AST mismatch\n"
            f"    expected: {json.dumps(expected_n, indent=2)[:400]}\n"
            f"    actual:   {json.dumps(actual_n, indent=2)[:400]}"
        )
    return True, ""


def _run_negative(md_path: Path) -> tuple[bool, str]:
    err_path = md_path.with_suffix(".expected-error.json")
    if not err_path.exists():
        return False, f"missing {err_path.name}"
    text = md_path.read_text(encoding="utf-8")
    expected = json.loads(err_path.read_text(encoding="utf-8"))
    needle = expected.get("error_contains", "")
    expected_line = expected.get("line")
    try:
        parse(text)
    except ParseError as e:
        if needle and needle not in str(e):
            return False, f"error message missing {needle!r}: got {e}"
        if expected_line is not None and e.line != expected_line:
            return False, f"line mismatch: expected {expected_line}, got {e.line}"
        return True, ""
    return False, "parser accepted input; expected ParseError"


def _run_roundtrip(md_path: Path) -> tuple[bool, str]:
    """Positive + a note that the AST survives JSON roundtrip."""
    ok, msg = _run_positive(md_path)
    if not ok:
        return ok, msg
    # AST itself already round-tripped via json.dumps/loads; record separately
    # in case we later add serialize-back-to-Markdown.
    return True, ""


def _run_edge(md_path: Path) -> tuple[bool, str]:
    # Edge cases use the positive-fixture shape (input → expected AST).
    return _run_positive(md_path)


def run_category(category: str, only: str | None = None) -> tuple[int, list[str]]:
    dir_ = FIXTURE_DIR / category
    if not dir_.exists():
        return 0, []
    fixtures = sorted(dir_.glob("*.md"))
    runner = {
        "positive": _run_positive,
        "negative": _run_negative,
        "roundtrip": _run_roundtrip,
        "edge": _run_edge,
    }[category]
    passed = 0
    failed: list[str] = []
    for fx in fixtures:
        rel = f"{category}/{fx.name}"
        if only and only != rel and only != fx.name:
            continue
        ok, err = runner(fx)
        if ok:
            print(f"  [PASS] {rel}")
            passed += 1
        else:
            print(f"  [FAIL] {rel}: {err}")
            failed.append(rel)
    return passed, failed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", choices=CATEGORIES + ["all"], default="all")
    ap.add_argument("--only", help="Single fixture by relative path")
    args = ap.parse_args()

    total_passed = 0
    total_failed: list[str] = []

    cats = CATEGORIES if args.category == "all" else [args.category]
    for cat in cats:
        print(f"\n[{cat}]")
        p, f = run_category(cat, args.only)
        total_passed += p
        total_failed.extend(f)

    total = total_passed + len(total_failed)
    print(f"\n  Passed: {total_passed}/{total}")
    if total_failed:
        print(f"  Failed: {', '.join(total_failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
