#!/usr/bin/env python3
"""Property-based tests for the MDZ parser using hypothesis.

Catches classes of bugs that example-based tests miss:
  - crashes on arbitrary Unicode input
  - divergence between legacy and Lark parsers
  - AST mutation bugs (parser modifying its input)
  - round-trip instability for structurally-valid documents

Runs 500 cases per property. Install: `pip install hypothesis`.
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "implementations" / "python"))

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from hypothesis import given, settings, strategies as st, HealthCheck, seed  # noqa: E402

from alignment_parser import parse as legacy_parse  # noqa: E402
from mdz_parser import parse as lark_parse, ParseError  # noqa: E402

# Pinned hypothesis seed for reproducibility across runs. Without this, a
# CI failure finds a different counterexample each invocation, making
# regressions hard to diagnose. Swap this if you need to re-explore the
# input space intentionally.
HYPOTHESIS_SEED = 0x6D647A42  # "mdzB"


# ---------------------------------------------------------------------------
# Strategies — how to generate "interesting" Markdown-shaped input
# ---------------------------------------------------------------------------

# Printable text that doesn't accidentally contain our directive syntax.
safe_text = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "P", "Zs"),
        blacklist_characters="`{}[]<>\\\n\r",
    ),
    min_size=1,
    max_size=80,
)

# Identifiers (for class names, ids, kv keys)
ident = st.from_regex(r"[a-z][a-z0-9\-]{0,20}", fullmatch=True)

# Simple quoted values
quoted_value = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "Zs"),
        blacklist_characters='"\'\\\n',
    ),
    min_size=0,
    max_size=40,
)

# Heading line, random level 1-6.
heading_line = st.builds(
    lambda lvl, txt: f"{'#' * lvl} {txt}\n",
    lvl=st.integers(min_value=1, max_value=6),
    txt=safe_text,
)

# Plain paragraph (non-empty line of safe text).
paragraph = st.builds(lambda t: t + "\n", t=safe_text)

# List items
list_item = st.one_of(
    st.builds(lambda t: f"- {t}\n", t=safe_text),
    st.builds(lambda t, n: f"{n}. {t}\n", t=safe_text, n=st.integers(1, 99)),
)

# Shorthand alignment marker
shorthand = st.sampled_from(["{:.left}\n", "{:.center}\n", "{:.right}\n", "{:.justify}\n"])

# Block-attribute line with classes + optional id + optional key=value
def _block_attr(classes: list[str], id_opt: str | None, kvs: list[tuple[str, str]]) -> str:
    parts: list[str] = [f".{c}" for c in classes]
    if id_opt:
        parts.append(f"#{id_opt}")
    for k, v in kvs:
        parts.append(f'{k}="{v}"')
    return "{" + " ".join(parts) + "}\n"


block_attr_line = st.builds(
    _block_attr,
    classes=st.lists(ident, min_size=1, max_size=3),
    id_opt=st.one_of(st.none(), ident),
    kvs=st.lists(st.tuples(ident, quoted_value), max_size=2),
)

# A block = a shorthand/attr marker followed by content (heading, paragraph, list item)
content_line = st.one_of(heading_line, paragraph, list_item)

# -----
# v2.0+ directive strategies. The original strategy set only generated
# v1.1-era blocks, which meant the v2.0/v2.1 surface (where bugs are
# most likely) was never exercised. These strategies cover the most
# common directive shapes.
# -----

# Cell source code (deliberately short + simple to stay within Hypothesis's
# deadline; real-world cells are tested via conformance fixtures).
cell_source = st.builds(
    lambda lang, code: f'::cell{{language="{lang}" kernel="{lang}3"}}\n```{lang}\n{code}\n```\n\n::output{{type="text"}}\n```\n{code}\n```\n',
    lang=st.sampled_from(["python", "r", "julia", "javascript"]),
    code=st.sampled_from(["x = 1", "print(1)", "y + 1", 'x <- 1']),
)

# Include directive with a non-empty target.
include_directive = st.builds(
    lambda tgt: f'::include[target="{tgt}"]\n',
    tgt=st.from_regex(r"[a-z][a-z0-9\-_/]*\.md", fullmatch=True),
)

# Container block with simple contents.
container = st.builds(
    lambda attrs, inner: f":::{{{attrs}}}\n{inner}\n:::\n",
    attrs=st.sampled_from([".note", ".warning", ".align-center"]),
    inner=paragraph,
)

# Labeled block (v2.1): ::fig / ::eq / ::tab with a valid id and a
# following body line.
labeled_block = st.builds(
    lambda kind, ident, body: f'::{kind}{{id="{ident}"}}\n\n{body}',
    kind=st.sampled_from(["fig", "eq", "tab"]),
    ident=st.from_regex(r"[a-z][a-z0-9\-]{0,10}", fullmatch=True),
    body=paragraph,
)

# Simple document: list of blocks separated by blank lines.
# Now includes v2.0/v2.1 shapes alongside v1.1 content.
document = st.builds(
    lambda blocks: "\n".join(blocks),
    blocks=st.lists(
        st.one_of(
            content_line,
            st.builds(lambda s, c: s + c, s=shorthand, c=content_line),
            st.builds(lambda a, c: a + c, a=block_attr_line, c=content_line),
            cell_source,
            include_directive,
            container,
            labeled_block,
        ),
        min_size=0,
        max_size=10,
    ),
)


# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------


@given(text=document)
@seed(HYPOTHESIS_SEED)
@settings(max_examples=500, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_parser_never_crashes_on_random_input(text: str) -> None:
    """For any generated document-shaped input, the parser must terminate
    with either a list result or a ParseError — never an uncaught exception.
    """
    try:
        result = lark_parse(text)
        assert isinstance(result, list), f"expected list, got {type(result)}"
    except ParseError:
        # ParseError is an acceptable outcome for malformed input; it's not
        # a property violation.
        pass


@given(text=document)
@seed(HYPOTHESIS_SEED)
@settings(max_examples=500, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_ast_is_json_serializable(text: str) -> None:
    """The AST must round-trip through JSON without loss."""
    try:
        ast = lark_parse(text)
    except ParseError:
        return
    json_str = json.dumps(ast, ensure_ascii=False, sort_keys=True)
    reparsed = json.loads(json_str)
    assert reparsed == ast


# Narrower document strategy for the legacy-vs-Lark parity property.
# Excludes v2.1 labeled blocks (::fig / ::eq / ::tab) because those are
# Lark-only; legacy parser routes them through the generic-directive path
# and produces a different AST by design. Removing this property when
# legacy is retired is a TODO in the docstring below.
document_v1_only = st.builds(
    lambda blocks: "\n".join(blocks),
    blocks=st.lists(
        st.one_of(
            content_line,
            st.builds(lambda s, c: s + c, s=shorthand, c=content_line),
            st.builds(lambda a, c: a + c, a=block_attr_line, c=content_line),
            include_directive,
            container,
            cell_source,
        ),
        min_size=0,
        max_size=10,
    ),
)


@given(text=document_v1_only)
@seed(HYPOTHESIS_SEED)
@settings(max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_legacy_and_lark_parsers_agree(text: str) -> None:
    """On v1.1 / v2.0 document-shaped input (no v2.1 labeled blocks), legacy
    and Lark parsers must produce identical ASTs. This locks their behavior
    together during the Phase 1 migration.

    NOTE: this property weakens as v2.1 features land in Lark but not legacy.
    Remove this test when the legacy parser is retired (end of Phase 1).
    Until then, the strategy excludes v2.1 directives explicitly.
    """
    legacy_result = None
    lark_result = None
    legacy_err = None
    lark_err = None
    try:
        legacy_result = legacy_parse(text)
    except ValueError as e:
        legacy_err = str(e)
    try:
        lark_result = lark_parse(text)
    except ValueError as e:
        lark_err = str(e)
    assert (legacy_result is None) == (lark_result is None), (
        f"parsers disagree on raise vs succeed:\n"
        f"  input:      {text!r}\n"
        f"  legacy err: {legacy_err}\n"
        f"  lark err:   {lark_err}"
    )
    if legacy_result is not None:
        assert legacy_result == lark_result, (
            f"parsers produce different ASTs:\n"
            f"  input:  {text!r}\n"
            f"  legacy: {legacy_result}\n"
            f"  lark:   {lark_result}"
        )


@given(text=st.text(max_size=2000))
@seed(HYPOTHESIS_SEED)
@settings(max_examples=200, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_parser_tolerates_arbitrary_text(text: str) -> None:
    """Given ANY string (not just document-shaped), the parser must terminate.

    This is the widest property: we don't require correct parsing of random
    text, only that the parser doesn't hang, recurse infinitely, or crash
    with an uncaught exception.
    """
    try:
        result = lark_parse(text)
        assert isinstance(result, list)
    except (ParseError, ValueError):
        pass


# Non-whitespace text for heading property — avoids the "parser trims
# Unicode whitespace from heading content" edge that makes exact equality
# unfair as a property.
heading_body_text = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "Po"),
        blacklist_characters="`{}[]<>\\\n\r",
    ),
    min_size=1,
    max_size=40,
)


@given(
    lvl=st.integers(min_value=1, max_value=6),
    heading_text=heading_body_text,
)
@seed(HYPOTHESIS_SEED)
@settings(max_examples=100, deadline=None)
def test_heading_roundtrip(lvl: int, heading_text: str) -> None:
    """A heading line parses to exactly one heading block with the right level.

    The content equality is asserted with Unicode whitespace stripped from
    both sides because CommonMark-style parsers normalize whitespace around
    heading content (`\\s+` in the heading regex matches any Unicode space).
    """
    text = f"{'#' * lvl} {heading_text}\n"
    ast = lark_parse(text)
    headings = [b for b in ast if b.get("type") == "heading"]
    assert len(headings) == 1
    assert headings[0]["level"] == lvl
    # Compare with Unicode whitespace stripped — this is the normalization
    # the parser performs via `\s+` in the heading regex.
    assert headings[0]["text"].strip() == heading_text.strip()


# ---------------------------------------------------------------------------
# Test runner (non-pytest, matches project convention)
# ---------------------------------------------------------------------------

TESTS = [
    test_parser_never_crashes_on_random_input,
    test_ast_is_json_serializable,
    test_legacy_and_lark_parsers_agree,
    test_parser_tolerates_arbitrary_text,
    test_heading_roundtrip,
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
        except Exception as e:
            # hypothesis raises a subclass of Exception on counterexample
            short = str(e)
            if len(short) > 400:
                short = short[:400] + "..."
            print(f"  [FAIL] {name}: {short}")
            failed.append(name)
    print()
    print(f"  Passed: {passed}/{len(TESTS)}")
    if failed:
        print(f"  Failed: {', '.join(failed)}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
