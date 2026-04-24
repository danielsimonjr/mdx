#!/usr/bin/env python3
"""Conformance tests for the reference alignment parser.

Feeds each fixture in `tests/alignment/*.md` through
`implementations/python/alignment_parser.py` and asserts the expected
structured output — specifically, the `classes` applied to each block
and the handling of malformed markers.

Unlike `validate_fixtures.py` (which only checks that fixtures contain
the expected raw syntax), this test verifies that a real parser
produces the correct block-level output per the v1.1 spec.

Run standalone:
    python tests/alignment/test_parser.py

Exit 0 on all assertions passing; exit 1 on first failure.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "implementations" / "python"))

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from alignment_parser import parse  # noqa: E402

FIXTURES = REPO_ROOT / "tests" / "alignment"


def _classes(blocks: list[dict]) -> list[list[str]]:
    """Helper: pull just the class lists for assertion readability."""
    return [b.get("classes", []) for b in blocks]


def _types(blocks: list[dict]) -> list[str]:
    return [b["type"] for b in blocks]


# ---------------------------------------------------------------------------
# Per-fixture test cases
# ---------------------------------------------------------------------------


def test_01_basic_alignment() -> None:
    blocks = parse((FIXTURES / "01-basic-alignment.md").read_text(encoding="utf-8"))
    assert _types(blocks) == ["paragraph"] * 4, _types(blocks)
    assert _classes(blocks) == [
        ["align-left"],
        ["align-center"],
        ["align-right"],
        ["align-justify"],
    ], _classes(blocks)


def test_02_headings() -> None:
    blocks = parse((FIXTURES / "02-headings.md").read_text(encoding="utf-8"))
    assert any(b["type"] == "heading" for b in blocks), "expected at least one heading"
    aligned_headings = [b for b in blocks if b["type"] == "heading" and b["classes"]]
    assert len(aligned_headings) >= 1, "expected at least one aligned heading"


def test_03_lists() -> None:
    blocks = parse((FIXTURES / "03-lists.md").read_text(encoding="utf-8"))
    items = [b for b in blocks if b["type"] in ("ordered_item", "unordered_item")]
    assert len(items) >= 1, "expected at least one list item"
    aligned_items = [b for b in items if b["classes"]]
    assert len(aligned_items) >= 1, "expected at least one aligned list item"


def test_04_blockquotes() -> None:
    blocks = parse((FIXTURES / "04-blockquotes.md").read_text(encoding="utf-8"))
    quotes = [b for b in blocks if b["type"] == "blockquote"]
    assert len(quotes) >= 1, "expected at least one blockquote"
    aligned_quotes = [q for q in quotes if q["classes"]]
    assert len(aligned_quotes) >= 1, "expected at least one aligned blockquote"


def test_05_directives_inline() -> None:
    blocks = parse((FIXTURES / "05-directives.md").read_text(encoding="utf-8"))
    directives = [b for b in blocks if b["type"] == "directive"]
    assert len(directives) >= 2, f"expected 2+ directives, got {len(directives)}"
    # At least one directive has an alignment class (either block-level or inline)
    assert any(any(c.startswith("align-") for c in d["classes"]) for d in directives)


def test_06_containers() -> None:
    blocks = parse((FIXTURES / "06-containers.md").read_text(encoding="utf-8"))
    # Two containers in the fixture — first is align-center (2 paragraphs),
    # second is align-right (1 paragraph). All 3 blocks should be aligned.
    assert _classes(blocks) == [
        ["align-center"],
        ["align-center"],
        ["align-right"],
    ], _classes(blocks)


def test_07_precedence() -> None:
    blocks = parse((FIXTURES / "07-precedence.md").read_text(encoding="utf-8"))
    # Block 1: inside :::{.align-center} container, has own {:.right} block
    #          attr → block wins over container → align-right.
    # Block 2: ::video directive with inline {.align-left}, preceded by
    #          a {:.center} block attr → inline wins → align-left.
    # Block 3: paragraph with no alignment.
    assert _classes(blocks)[0] == ["align-right"], _classes(blocks)
    assert _classes(blocks)[1] == ["align-left"], _classes(blocks)


def test_08_combined_attributes() -> None:
    blocks = parse((FIXTURES / "08-combined-attributes.md").read_text(encoding="utf-8"))
    # Fixture has 2 paragraphs:
    #   {.align-center .highlight #important}
    #   Multiple attributes combined.
    #   {.align-right style="color: red;"}
    #   With inline style.
    assert len(blocks) == 2, blocks
    # First paragraph: both align-center AND highlight classes, plus id=important
    classes_0 = blocks[0]["classes"]
    assert "align-center" in classes_0
    assert "highlight" in classes_0
    assert blocks[0].get("id") == "important"
    # Second paragraph: align-right; style attr captured in kv (we don't
    # assert kv here; just that align-right made it through).
    assert "align-right" in blocks[1]["classes"]


def test_09_malformed_degrades_gracefully() -> None:
    blocks = parse((FIXTURES / "09-malformed.md").read_text(encoding="utf-8"))
    # Three things must hold:
    # 1. The malformed `{.incomplete` does NOT get treated as an attr block
    #    — it appears as a paragraph, and the NEXT line ("This is not a
    #    valid attribute block.") must NOT inherit classes from it.
    # 2. The valid `{:.center}` → centered paragraph still works.
    # 3. The `{missing-dot}` is plain text, not a class-bearing attr block.
    # The parser should produce one paragraph per input line, no alignment
    # leaking from the malformed markers.
    align_bearing = [b for b in blocks if b["classes"]]
    # Only ONE valid alignment applies (the {:.center} line)
    assert len(align_bearing) == 1, [b for b in blocks]
    assert align_bearing[0]["classes"] == ["align-center"]
    assert align_bearing[0]["text"] == "This is valid and should be centered."


def test_10_backward_compat() -> None:
    blocks = parse((FIXTURES / "10-backward-compat.md").read_text(encoding="utf-8"))
    # Backward-compat fixture: v1.0 document with no v1.1 syntax. Every
    # block should have an empty classes list.
    for b in blocks:
        assert b["classes"] == [], f"unexpected classes on {b}: expected []"


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

TESTS = [
    test_01_basic_alignment,
    test_02_headings,
    test_03_lists,
    test_04_blockquotes,
    test_05_directives_inline,
    test_06_containers,
    test_07_precedence,
    test_08_combined_attributes,
    test_09_malformed_degrades_gracefully,
    test_10_backward_compat,
]


def main() -> int:
    passed = 0
    failed = []
    for test in TESTS:
        name = test.__name__
        try:
            test()
            print(f"  [PASS] {name}")
            passed += 1
        except AssertionError as e:
            print(f"  [FAIL] {name}: {e}")
            failed.append(name)
        except Exception as e:
            print(f"  [ERROR] {name}: {type(e).__name__}: {e}")
            failed.append(name)

    print()
    print(f"  Passed: {passed}/{len(TESTS)}")
    if failed:
        print(f"  Failed: {', '.join(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
