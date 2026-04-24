#!/usr/bin/env python3
"""Lark parser tests — verifies the new mdz_parser package matches the
legacy alignment_parser on all existing fixtures, and enforces the same
error-path behavior.

This is the bridge test during the Phase 1 parser migration. When the Lark
parser is promoted to primary (end of Phase 1), this file can be renamed
to test_parser.py and the legacy test file retired.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "implementations" / "python"))

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from alignment_parser import parse as legacy_parse  # noqa: E402
from mdz_parser import parse as lark_parse, ParseError  # noqa: E402

V2_FIXTURES = REPO_ROOT / "examples" / "v2" / "parser-fixtures"
V2_ERROR_FIXTURES = V2_FIXTURES / "errors"
V11_FIXTURES = REPO_ROOT / "tests" / "alignment"


def _compare(label: str, text: str) -> None:
    """Both parsers must produce identical output on `text`."""
    legacy = legacy_parse(text)
    lark = lark_parse(text)
    assert legacy == lark, (
        f"{label}: parser outputs diverge\n"
        f"  legacy: {legacy!r}\n"
        f"  lark:   {lark!r}"
    )


# ---------------------------------------------------------------------------
# Parity tests — new parser must match legacy on every existing fixture
# ---------------------------------------------------------------------------

def test_parity_v11_basic_alignment() -> None:
    _compare("v1.1 basic alignment", (V11_FIXTURES / "01-basic-alignment.md").read_text(encoding="utf-8"))


def test_parity_v11_headings() -> None:
    _compare("v1.1 headings", (V11_FIXTURES / "02-headings.md").read_text(encoding="utf-8"))


def test_parity_v11_lists() -> None:
    _compare("v1.1 lists", (V11_FIXTURES / "03-lists.md").read_text(encoding="utf-8"))


def test_parity_v11_blockquotes() -> None:
    _compare("v1.1 blockquotes", (V11_FIXTURES / "04-blockquotes.md").read_text(encoding="utf-8"))


def test_parity_v11_directives_inline() -> None:
    _compare("v1.1 inline directives", (V11_FIXTURES / "05-directives.md").read_text(encoding="utf-8"))


def test_parity_v11_containers() -> None:
    _compare("v1.1 containers", (V11_FIXTURES / "06-containers.md").read_text(encoding="utf-8"))


def test_parity_v11_precedence() -> None:
    _compare("v1.1 precedence", (V11_FIXTURES / "07-precedence.md").read_text(encoding="utf-8"))


def test_parity_v11_combined_attributes() -> None:
    _compare("v1.1 combined attrs", (V11_FIXTURES / "08-combined-attributes.md").read_text(encoding="utf-8"))


def test_parity_v11_malformed() -> None:
    _compare("v1.1 malformed graceful", (V11_FIXTURES / "09-malformed.md").read_text(encoding="utf-8"))


def test_parity_v11_backward_compat() -> None:
    _compare("v1.1 backward compat", (V11_FIXTURES / "10-backward-compat.md").read_text(encoding="utf-8"))


def test_parity_v20_includes() -> None:
    _compare("v2.0 includes", (V2_FIXTURES / "includes.md").read_text(encoding="utf-8"))


def test_parity_v20_cell_basic() -> None:
    _compare("v2.0 cell basic", (V2_FIXTURES / "cell-basic.md").read_text(encoding="utf-8"))


def test_parity_v20_cell_multi_output() -> None:
    _compare("v2.0 cell multi-output", (V2_FIXTURES / "cell-multi-output.md").read_text(encoding="utf-8"))


def test_parity_v20_cell_frozen() -> None:
    _compare("v2.0 cell frozen", (V2_FIXTURES / "cell-frozen.md").read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Error-path parity — new parser must raise on the same inputs as legacy
# ---------------------------------------------------------------------------

def _both_raise(fixture_name: str, needle: str) -> None:
    text = (V2_ERROR_FIXTURES / fixture_name).read_text(encoding="utf-8")
    # Legacy: should raise (alignment_parser.ParseError is a ValueError subclass)
    legacy_raised = False
    try:
        legacy_parse(text)
    except ValueError as e:
        legacy_raised = needle in str(e)
    # Lark: should raise (mdz_parser.ParseError is a ValueError subclass)
    lark_raised = False
    try:
        lark_parse(text)
    except ParseError as e:
        lark_raised = needle in str(e)
    assert legacy_raised, f"legacy parser did not raise {needle!r} on {fixture_name}"
    assert lark_raised, f"lark parser did not raise {needle!r} on {fixture_name}"


def test_error_unterminated_fence() -> None:
    _both_raise("unterminated-fence.md", "unterminated fenced code block")


def test_error_empty_cell_source() -> None:
    _both_raise("empty-cell-source.md", "fenced source code block")


def test_error_empty_include_target() -> None:
    _both_raise("empty-include-target.md", "non-empty `target`")


def test_error_output_missing_type() -> None:
    _both_raise("output-missing-type.md", "requires an explicit")


def test_error_bad_execution_count() -> None:
    _both_raise("bad-execution-count.md", "execution_count must be an integer")


def test_error_empty_output_body() -> None:
    _both_raise("empty-output-body.md", "inline fenced body")


# ---------------------------------------------------------------------------
# Lark fallback path — v1.1 block-attrs must degrade gracefully on
# malformed attr bodies, while v2.0 directives must raise loudly.
# ---------------------------------------------------------------------------


def test_lark_v11_block_attr_degrades_on_malformed_body() -> None:
    """A v1.1 block-attr line with a body that passes the line-level regex
    but fails Lark's grammar MUST degrade to an empty ParsedAttrs (the
    spec's graceful-degradation policy), not raise.

    We simulate this by monkeypatching Lark to raise on a body that would
    normally parse.
    """
    from unittest.mock import patch
    import mdz_parser.parser as pmod

    # Deliberately construct a BLOCK_ATTR line that the line regex DOES
    # match (has a `.` prefix) but the Lark grammar would fail on — e.g.,
    # contains a class-like token followed by garbage the grammar can't
    # handle. Since the grammar is currently permissive, we force the
    # failure via monkeypatch to exercise the fallback branch deterministically.
    class _FakeErr(Exception):
        pass

    def boom(_body: str) -> None:
        raise pmod.LarkError("simulated grammar failure")

    text = "{.classname}\nParagraph body.\n"
    with patch.object(pmod, "_parse_attrs_lark", wraps=pmod._parse_attrs_lark) as wrapped:
        # First call through the real function verifies normal path works.
        blocks_ok = lark_parse(text)
        assert blocks_ok[0]["classes"] == ["classname"]

    # Now force Lark itself to raise and confirm block-attr still degrades.
    with patch.object(
        pmod._get_attr_parser(), "parse", side_effect=pmod.LarkError("forced")
    ):
        blocks = lark_parse(text)
    assert blocks[0]["type"] == "paragraph"
    assert blocks[0]["classes"] == []  # fallback -> empty ParsedAttrs


def test_lark_v20_cell_raises_on_malformed_attrs() -> None:
    """Contrast with the v1.1 behavior above: v2.0 directive paths use
    strict=True, so a malformed attr body inside `::cell{...}` raises
    ParseError instead of silently producing an attribute-less cell."""
    from unittest.mock import patch
    import mdz_parser.parser as pmod

    text = (
        '::cell{language="python" kernel="python3"}\n'
        "```python\nx = 1\n```\n\n"
        '::output{type="text"}\n'
        "```\n1\n```\n"
    )
    # Force Lark to fail specifically on the cell's attr body.
    original_parse = pmod._get_attr_parser().parse

    call_count = {"n": 0}

    def selective_fail(body: str) -> Any:
        call_count["n"] += 1
        if call_count["n"] == 1:  # fail on the first (cell) attr parse
            raise pmod.LarkError("forced")
        return original_parse(body)

    with patch.object(pmod._get_attr_parser(), "parse", side_effect=selective_fail):
        try:
            lark_parse(text)
        except ParseError as e:
            assert "malformed directive attributes" in str(e)
            assert e.line >= 1
            return
        raise AssertionError("expected ParseError but parse succeeded")


# ---------------------------------------------------------------------------
# v2.1 labeled blocks — Lark-only (legacy doesn't implement these)
# ---------------------------------------------------------------------------

def test_lark_figure_block() -> None:
    text = '::fig{id="fig-1"}\n\n![caption](assets/fig.png)\n'
    blocks = lark_parse(text)
    figs = [b for b in blocks if b.get("type") == "figure"]
    assert len(figs) == 1, figs
    assert figs[0]["id"] == "fig-1"


def test_lark_equation_block() -> None:
    text = '::eq{id="e-1"}\n\nE = mc^2\n'
    blocks = lark_parse(text)
    eqs = [b for b in blocks if b.get("type") == "equation"]
    assert len(eqs) == 1
    assert eqs[0]["id"] == "e-1"


def test_lark_figure_without_id_raises() -> None:
    text = '::fig{caption="no id here"}\n\n![caption](assets/fig.png)\n'
    try:
        lark_parse(text)
    except ParseError as e:
        assert "id" in str(e)
        return
    raise AssertionError("expected ParseError for ::fig without id")


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

TESTS = [
    # Parity
    test_parity_v11_basic_alignment,
    test_parity_v11_headings,
    test_parity_v11_lists,
    test_parity_v11_blockquotes,
    test_parity_v11_directives_inline,
    test_parity_v11_containers,
    test_parity_v11_precedence,
    test_parity_v11_combined_attributes,
    test_parity_v11_malformed,
    test_parity_v11_backward_compat,
    test_parity_v20_includes,
    test_parity_v20_cell_basic,
    test_parity_v20_cell_multi_output,
    test_parity_v20_cell_frozen,
    # Error paths
    test_error_unterminated_fence,
    test_error_empty_cell_source,
    test_error_empty_include_target,
    test_error_output_missing_type,
    test_error_bad_execution_count,
    test_error_empty_output_body,
    # Lark fallback path (v1.1 degrades; v2.0 raises)
    test_lark_v11_block_attr_degrades_on_malformed_body,
    test_lark_v20_cell_raises_on_malformed_attrs,
    # v2.1 Lark-only
    test_lark_figure_block,
    test_lark_equation_block,
    test_lark_figure_without_id_raises,
]


def main() -> int:
    passed = 0
    failed: list[str] = []
    for t in TESTS:
        name = t.__name__
        try:
            t()
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
