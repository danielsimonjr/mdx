"""Line-oriented parser that delegates directive syntax to Lark.

This parser is a clean reimplementation of the logic in
`alignment_parser.py`. Behavior is deliberately identical on all existing
conformance fixtures; the refactor replaces ad-hoc regex parsing of the
attribute-body grammar with Lark.

Design notes:

- **Why line-oriented:** CommonMark is line-sensitive. Modeling the
  interaction of lists / indentation / fences in a single whole-document
  PEG grammar is a rabbit hole. Instead we split the document into
  logical blocks line-by-line and delegate the MDZ-specific directive
  pieces to Lark. Each directive line (block-attr, shorthand, container
  open/close, cell-open, output-open, include, inline directive) is
  parsed with Lark to produce a structured ParsedAttrs.
- **Why Lark:** actively maintained, pure-Python, handles the attr-body
  grammar (classes, ids, quoted/unquoted key-value pairs, escaping)
  without the regex gymnastics of the old parser.
- **Error policy:** v2.0 directives fail loud on structural errors;
  v1.1 attribute markers degrade gracefully to plain text (backward
  compat).
"""

from __future__ import annotations

import re
import warnings
from pathlib import Path
from typing import Any

from lark import Lark, Transformer, v_args
from lark.exceptions import LarkError

from .ast import ParsedAttrs
from .errors import ParseError


class MalformedAttributeWarning(UserWarning):
    """Emitted when a line looks like an attribute marker but can't be parsed.

    v1.1 spec mandates that malformed block-attribute lines degrade to plain
    paragraphs — see `tests/alignment/09-malformed.md`. But "silently a
    paragraph" is easy to miss; a user typing ``{#my-id}`` just below an
    image with a bad indent gets their id dropped without any feedback.
    This warning surfaces that for tooling (linters, IDEs) while keeping
    the spec-required AST shape unchanged.

    To escalate malformed attrs to errors in a strict mode, run with
    ``warnings.filterwarnings('error', category=MalformedAttributeWarning)``.
    """


# ---------------------------------------------------------------------------
# Lark grammar loader
# ---------------------------------------------------------------------------

_GRAMMAR_PATH = Path(__file__).resolve().parents[3] / "spec" / "grammar" / "mdz-directives.lark"


# JSON-style escape sequences allowed inside QUOTED_STR attribute values.
# Matches the ABNF `escape` production. Unlike Python's `unicode_escape`
# codec, this does NOT mangle non-ASCII input (e.g., `src="résumé.md"` stays
# intact) because we iterate code points, not bytes.
_ESCAPE_MAP: dict[str, str] = {
    '"': '"',
    "'": "'",
    "\\": "\\",
    "/": "/",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
}


def _unescape_quoted(inner: str) -> str:
    """Unescape a QUOTED_STR body per the ABNF `escape` production.

    Handles \\", \\', \\\\, \\/, \\b, \\f, \\n, \\r, \\t. Unknown escapes
    pass through as the literal character after the backslash. Non-ASCII
    input is preserved byte-for-byte (unlike `bytes.decode('unicode_escape')`
    which would corrupt it).
    """
    out: list[str] = []
    i = 0
    while i < len(inner):
        ch = inner[i]
        if ch == "\\" and i + 1 < len(inner):
            nxt = inner[i + 1]
            out.append(_ESCAPE_MAP.get(nxt, nxt))
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


# Identifier pattern shared with the ABNF grammar (IDENT production).
# Exposed as a compiled regex so ParsedAttrs validation and labeled-block
# id format checks stay in sync.
_IDENT_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


@v_args(inline=True)
class _AttrTransformer(Transformer):
    """Transform Lark parse tree of a directive line into ParsedAttrs + kind."""

    def attr_body(self, *items: ParsedAttrs) -> ParsedAttrs:
        merged = ParsedAttrs()
        for it in items:
            merged.classes.extend(it.classes)
            if it.id and not merged.id:
                merged.id = it.id
            merged.kv.update(it.kv)
        return merged

    # `attr_item` is a pass-through — the grammar wraps class_item / id_item /
    # kv_item in it, but semantically each sub-rule already produces the
    # ParsedAttrs we want. Just unwrap.
    def attr_item(self, inner: ParsedAttrs) -> ParsedAttrs:
        return inner

    def class_item(self, name: Any) -> ParsedAttrs:
        return ParsedAttrs(classes=[str(name)])

    def id_item(self, name: Any) -> ParsedAttrs:
        return ParsedAttrs(id=str(name))

    def kv_item(self, key: Any, value_str: str) -> ParsedAttrs:
        return ParsedAttrs(kv={str(key): value_str})

    def bool_item(self, name: Any) -> ParsedAttrs:
        # HTML-style boolean attribute (e.g., `controls`, `autoplay`,
        # `frozen`). Surface as kv={name: "true"} so downstream consumers
        # can look for it via the same kv.get(name) path as any other
        # attribute. This also means ``::cell{frozen}`` works identically
        # to ``::cell{frozen="true"}``, matching HTML conventions.
        return ParsedAttrs(kv={str(name): "true"})

    def value(self, v: Any) -> str:
        s = str(v)
        # Strip surrounding quotes on QUOTED_STR and unescape per the ABNF
        # escape production. UNQUOTED_VALUE passes through untouched.
        if len(s) >= 2 and (
            (s[0] == '"' and s[-1] == '"') or (s[0] == "'" and s[-1] == "'")
        ):
            return _unescape_quoted(s[1:-1])
        return s


# The Lark parser: parses a single directive line.
# Cached at module level to avoid repeated grammar compilation.
_directive_parser: Lark | None = None


def _get_directive_parser() -> Lark:
    global _directive_parser
    if _directive_parser is None:
        grammar = _GRAMMAR_PATH.read_text(encoding="utf-8")
        _directive_parser = Lark(grammar, start="directive_line", parser="earley")
    return _directive_parser


# Cache the attr_body parser too — constructing it per-call was hot-path waste.
_attr_parser: Lark | None = None


def _get_attr_parser() -> Lark:
    global _attr_parser
    if _attr_parser is None:
        grammar = _GRAMMAR_PATH.read_text(encoding="utf-8")
        # ambiguity="explicit" makes Lark raise `_Ambig` trees rather than
        # silently picking one derivation. If our grammar ever becomes
        # ambiguous (e.g., edited such that `foo` could parse as both
        # bool_item and class_item), the transformer will fail loudly
        # instead of silently choosing.
        _attr_parser = Lark(
            grammar,
            start="attr_body",
            parser="earley",
            ambiguity="explicit",
        )
    return _attr_parser


def _parse_attrs_lark(body: str, *, strict: bool = False, line: int = 0) -> ParsedAttrs:
    """Parse an attribute body (inside `{...}` or `[...]`) via Lark.

    Returns an empty ParsedAttrs for empty input.

    Error policy depends on `strict`:
    - `strict=False` (v1.1 block-attr / shorthand path) — malformed bodies
      degrade to empty ParsedAttrs per the spec's "graceful degradation"
      rule. `{word}` without a dot/hash prefix falls through as a
      plain-text paragraph.
    - `strict=True` (v2.0+ directive path — cell, output, include,
      container, labeled-block, inline-directive) — malformed bodies
      raise `ParseError` with line-number context. Silent fallback for
      these directives was a review finding (they carry semantic payload;
      swallowing a typo in ``::cell{language="python kernel="p"}`` would
      produce a cell with no language silently).
    """
    body = body.strip()
    if not body:
        return ParsedAttrs()
    try:
        tree = _get_attr_parser().parse(body)
    except LarkError as e:
        if strict:
            raise ParseError(
                f"malformed directive attributes {{{body}}}: {e}",
                line or 1,
            )
        return ParsedAttrs()
    # If the grammar is ambiguous, Lark wraps the tree with _Ambig. With
    # ambiguity="explicit" this surfaces as a Tree whose data == "_ambig".
    if getattr(tree, "data", None) == "_ambig":
        raise ParseError(
            f"ambiguous attribute body {{{body}}} — grammar needs disambiguation",
            line or 1,
        )
    return _AttrTransformer().transform(tree)


# ---------------------------------------------------------------------------
# Line-level regexes (only used to IDENTIFY directive lines; the ATTRIBUTE
# BODY is parsed via Lark via _parse_attrs_lark)
# ---------------------------------------------------------------------------

RE_SHORTHAND = re.compile(r"^\s*\{:\.([a-z][a-z0-9\-]*)\}\s*$")
RE_BLOCK_ATTR = re.compile(
    r"""^\s*\{
        (?=[^}]*[.#])
        ([^}\n]+)
        \}\s*$""",
    re.VERBOSE,
)
RE_CONTAINER_OPEN = re.compile(
    r"""^\s*(?P<colons>:{3,})
        (?P<name>[a-z][a-z0-9\-]*)?
        (?:\{(?P<attrs>[^}]*)\})?
        \s*$""",
    re.VERBOSE,
)
RE_CONTAINER_CLOSE = re.compile(r"^\s*:{3,}\s*$")
RE_INLINE_DIRECTIVE = re.compile(
    r"""^\s*::(?P<name>[a-z][a-z0-9\-]*)
        (?:\[(?P<label>[^\]]*)\])?
        (?:\{(?P<attrs>[^}]*)\})?
        \s*$""",
    re.VERBOSE,
)
RE_CELL_OPEN = re.compile(r"""^\s*::cell(?:\{(?P<attrs>[^}]*)\})?\s*$""", re.VERBOSE)
RE_OUTPUT_OPEN = re.compile(r"""^\s*::output(?:\{(?P<attrs>[^}]*)\})?\s*$""", re.VERBOSE)
RE_LABELED_BLOCK = re.compile(
    r"""^\s*::(?P<kind>fig|eq|tab)\{(?P<attrs>[^}]*)\}\s*$""",
    re.VERBOSE,
)
RE_FENCE = re.compile(r"^\s*```(?P<lang>[a-zA-Z0-9_\-]*)\s*$")
RE_HEADING = re.compile(r"^\s*(#{1,6})\s+(.*?)\s*$")
RE_BLOCKQUOTE = re.compile(r"^\s*>\s?(.*)$")
RE_ORDERED_ITEM = re.compile(r"^\s*\d+\.\s+(.+)$")
RE_UNORDERED_ITEM = re.compile(r"^\s*[-*+]\s+(.+)$")

_ALIGN_RE = re.compile(r"^align-")


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


class MDZParser:
    """Reusable parser instance. Construct once, parse many."""

    def __init__(self) -> None:
        # Ensure grammar loads at construction for early failure.
        _get_directive_parser()

    def parse(self, text: str) -> list[dict]:
        return parse(text)


def _resolve_classes(
    container_attrs: ParsedAttrs,
    block_attrs: ParsedAttrs,
    inline_attrs: ParsedAttrs,
) -> list[str]:
    """Apply precedence: inline > block > container for `align-*` class.

    Non-align classes are union'd across all three sources."""
    align_inline = [c for c in inline_attrs.classes if _ALIGN_RE.match(c)]
    align_block = [c for c in block_attrs.classes if _ALIGN_RE.match(c)]
    align_container = [c for c in container_attrs.classes if _ALIGN_RE.match(c)]
    winner = (align_inline or align_block or align_container)[:1]
    non_align: set[str] = set()
    for src in (container_attrs, block_attrs, inline_attrs):
        for c in src.classes:
            if not _ALIGN_RE.match(c):
                non_align.add(c)
    return winner + sorted(non_align)


def _consume_fence(lines: list[str], start: int) -> tuple[str, str, int]:
    """Consume a fenced code block; return (lang, body, next_index).

    Raises ParseError on unterminated fence.
    """
    if start >= len(lines):
        return "", "", start
    m = RE_FENCE.match(lines[start])
    if not m:
        return "", "", start
    lang = m.group("lang") or ""
    body: list[str] = []
    i = start + 1
    while i < len(lines):
        if RE_FENCE.match(lines[i]):
            return lang, "\n".join(body), i + 1
        body.append(lines[i])
        i += 1
    raise ParseError(
        "unterminated fenced code block (opened here, no matching ``` "
        "found before EOF)",
        start + 1,
    )


def _skip_blank(lines: list[str], i: int) -> int:
    while i < len(lines) and not lines[i].strip():
        i += 1
    return i


def parse(text: str) -> list[dict]:
    """Parse MDZ-flavored Markdown into a list of block dicts.

    Compatible with the output of the legacy alignment_parser.parse().
    """
    lines = text.splitlines()
    blocks: list[dict] = []
    container_stack: list[ParsedAttrs] = []
    pending_block: ParsedAttrs | None = None

    def effective_container() -> ParsedAttrs:
        merged = ParsedAttrs()
        for c in container_stack:
            merged = c.extend(merged)
        return merged

    def emit(block: dict, inline: ParsedAttrs | None = None) -> None:
        nonlocal pending_block
        inline = inline or ParsedAttrs()
        block_attrs = pending_block or ParsedAttrs()
        block["classes"] = _resolve_classes(effective_container(), block_attrs, inline)
        chosen_id = inline.id or block_attrs.id
        if chosen_id:
            block["id"] = chosen_id
        blocks.append(block)
        pending_block = None

    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip("\r")
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Container close — only valid when stack is non-empty
        if RE_CONTAINER_CLOSE.match(line) and container_stack:
            container_stack.pop()
            i += 1
            continue

        # Container open (v2.0 — strict attr parsing)
        m = RE_CONTAINER_OPEN.match(line)
        if m and (m.group("attrs") is not None or m.group("name") is not None):
            attrs = _parse_attrs_lark(m.group("attrs") or "", strict=True, line=i + 1)
            if m.group("name"):
                attrs.kv.setdefault("_directive", m.group("name"))
            container_stack.append(attrs)
            i += 1
            continue

        # Shorthand alignment
        m = RE_SHORTHAND.match(line)
        if m:
            pending_block = ParsedAttrs(classes=[f"align-{m.group(1)}"])
            i += 1
            continue

        # Block-level attribute line (v1.1 — graceful degradation per spec:
        # `{word}` without dot/hash prefix falls through as plain paragraph)
        m = RE_BLOCK_ATTR.match(line)
        if m:
            pending_block = _parse_attrs_lark(m.group(1), strict=False)
            i += 1
            continue

        # v2.1 labeled blocks (::fig / ::eq / ::tab)
        m_lab = RE_LABELED_BLOCK.match(line)
        if m_lab:
            kind = m_lab.group("kind")
            label_line = i + 1
            # Strict attr parsing — a typo in `::fig{id="f1` (unclosed)
            # MUST fail loudly; labeled blocks carry semantic payload
            # (cross-reference targets) where silent drop is data loss.
            attrs = _parse_attrs_lark(
                m_lab.group("attrs"), strict=True, line=label_line
            )
            # Presence check: an explicit empty `id=""` is as bad as missing.
            raw_id = attrs.kv.get("id") or attrs.id or ""
            if not raw_id.strip():
                raise ParseError(
                    f"::{kind} requires a non-empty `id=\"...\"` attribute "
                    f"for cross-reference resolution",
                    label_line,
                )
            # Format check: the id must match the IDENT production in the
            # grammar so `::ref[<id>]` can resolve deterministically.
            # `::fig{id="foo bar"}` is parseable (QUOTED_STR accepts space)
            # but semantically invalid — reject at parse time with a clear
            # error rather than let it slip through to render-time "id not
            # found" confusion.
            if not _IDENT_RE.match(raw_id):
                raise ParseError(
                    f"::{kind} id={raw_id!r} is not a valid identifier "
                    f"(must match [A-Za-z][A-Za-z0-9_-]*)",
                    label_line,
                )
            j = _skip_blank(lines, i + 1)
            body_source = lines[j] if j < len(lines) else ""
            # The labeled-block id is AUTHORITATIVE — a preceding
            # `{#other-id}` block-attr must NOT overwrite it. Pass the id
            # out-of-band (in `inline.id`) so emit()'s precedence rule
            # (inline > block > container) keeps our id intact.
            inline_with_id = ParsedAttrs(
                classes=list(attrs.classes),
                id=raw_id,
                kv=dict(attrs.kv),
            )
            emit({
                "type": {"fig": "figure", "eq": "equation", "tab": "table"}[kind],
                "body_source": body_source.strip(),
            }, inline=inline_with_id)
            # Advance past the body source line so it doesn't double-emit.
            i = j + 1 if j < len(lines) else j
            continue

        # v2.0 ::cell
        m = RE_CELL_OPEN.match(line)
        if m:
            cell_line = i + 1
            cell_attrs = _parse_attrs_lark(
                m.group("attrs") or "", strict=True, line=cell_line
            )
            j = _skip_blank(lines, i + 1)
            if j >= len(lines) or not RE_FENCE.match(lines[j]):
                raise ParseError(
                    "::cell requires a fenced source code block "
                    "immediately after the directive",
                    cell_line,
                )
            src_lang, src_body, j = _consume_fence(lines, j)
            if not src_body.strip():
                raise ParseError(
                    "::cell source block is empty; empty cells are not "
                    "valid (use `frozen=\"true\"` with explicit source)",
                    cell_line,
                )

            outputs: list[dict] = []
            while True:
                j2 = _skip_blank(lines, j)
                if j2 >= len(lines):
                    j = j2
                    break
                om = RE_OUTPUT_OPEN.match(lines[j2])
                if not om:
                    j = j2
                    break
                out_line = j2 + 1
                out_attrs = _parse_attrs_lark(
                    om.group("attrs") or "", strict=True, line=out_line
                )
                if "type" not in out_attrs.kv:
                    raise ParseError(
                        "::output requires an explicit `type=\"...\"` "
                        "attribute (e.g., text, image, html, json)",
                        out_line,
                    )
                j3 = _skip_blank(lines, j2 + 1)
                out_body = ""
                if j3 < len(lines) and RE_FENCE.match(lines[j3]):
                    _, out_body, j3 = _consume_fence(lines, j3)
                if not out_body and not out_attrs.kv.get("src"):
                    raise ParseError(
                        "::output must have either an inline fenced body "
                        "or an `src=\"...\"` attribute",
                        out_line,
                    )
                out_block: dict = {"type": out_attrs.kv["type"]}
                if out_attrs.kv.get("mime"):
                    out_block["mime"] = out_attrs.kv["mime"]
                if out_attrs.kv.get("src"):
                    out_block["src"] = out_attrs.kv["src"]
                if out_body:
                    out_block["body"] = out_body
                outputs.append(out_block)
                j = j3

            cell_block: dict = {
                "type": "cell",
                "language": cell_attrs.kv.get("language", src_lang or ""),
                "kernel": cell_attrs.kv.get("kernel", ""),
                "source": src_body,
                "outputs": outputs,
            }
            if "execution_count" in cell_attrs.kv:
                raw_ec = cell_attrs.kv["execution_count"]
                try:
                    ec = int(raw_ec)
                except ValueError:
                    raise ParseError(
                        f"::cell execution_count must be an integer, "
                        f"got {raw_ec!r}",
                        cell_line,
                    )
                # ABNF normative constraint #5: non-negative integer.
                # Jupyter execution counts are 1-based but 0 is accepted
                # (some runtimes use it for "not yet executed"). Negative
                # values make no physical sense.
                if ec < 0:
                    raise ParseError(
                        f"::cell execution_count must be a non-negative "
                        f"integer, got {raw_ec!r}",
                        cell_line,
                    )
                cell_block["execution_count"] = ec
            if cell_attrs.kv.get("frozen") == "true":
                cell_block["frozen"] = True
            emit(cell_block, inline=cell_attrs)
            i = j
            continue

        # v2.0 ::include
        m_inc = RE_INLINE_DIRECTIVE.match(line)
        if m_inc and m_inc.group("name") == "include":
            inc_line = i + 1
            bracket = _parse_attrs_lark(
                m_inc.group("label") or "", strict=True, line=inc_line
            )
            brace = _parse_attrs_lark(
                m_inc.group("attrs") or "", strict=True, line=inc_line
            )
            combined = {**bracket.kv, **brace.kv}
            target = combined.get("target") or combined.get("path") or ""
            if not target.strip():
                raise ParseError(
                    "::include requires a non-empty `target` (or `path`) "
                    "attribute",
                    inc_line,
                )
            inc_block: dict = {"type": "include", "target": target}
            if combined.get("fragment"):
                inc_block["fragment"] = combined["fragment"]
            if combined.get("content_hash"):
                inc_block["content_hash"] = combined["content_hash"]
            emit(inc_block, inline=brace)
            i += 1
            continue

        # Generic inline directive
        m = RE_INLINE_DIRECTIVE.match(line)
        if m:
            attrs = _parse_attrs_lark(
                m.group("attrs") or "", strict=True, line=i + 1
            )
            block: dict = {
                "type": "directive",
                "name": m.group("name"),
                "label": m.group("label") or "",
            }
            if "src" in attrs.kv:
                block["src"] = attrs.kv["src"]
            emit(block, inline=attrs)
            i += 1
            continue

        # Heading
        m = RE_HEADING.match(line)
        if m:
            emit({"type": "heading", "level": len(m.group(1)), "text": m.group(2)})
            i += 1
            continue

        # Blockquote
        m = RE_BLOCKQUOTE.match(line)
        if m:
            emit({"type": "blockquote", "text": m.group(1)})
            i += 1
            continue

        # Ordered list item
        m = RE_ORDERED_ITEM.match(line)
        if m:
            emit({"type": "ordered_item", "text": m.group(1)})
            i += 1
            continue

        # Unordered list item
        m = RE_UNORDERED_ITEM.match(line)
        if m:
            emit({"type": "unordered_item", "text": m.group(1)})
            i += 1
            continue

        # Malformed: unclosed brace or bare {word} — passthrough as paragraph
        # per v1.1 graceful-degradation policy. A MalformedAttributeWarning
        # is issued so tooling (linters, IDEs) can surface the likely typo
        # without changing the spec-required AST shape.
        if stripped.startswith("{") and "}" not in stripped:
            warnings.warn(
                f"line {i + 1}: unclosed attribute marker {stripped!r} — "
                f"treating as plain paragraph per v1.1 degradation rule",
                MalformedAttributeWarning,
                stacklevel=2,
            )
            emit({"type": "paragraph", "text": stripped})
            i += 1
            continue
        if re.match(r"^\{[a-z][a-z0-9\-]*\}$", stripped):
            warnings.warn(
                f"line {i + 1}: bare {{{stripped[1:-1]}}} attribute (no "
                f"`.` or `#` prefix) — treating as plain paragraph",
                MalformedAttributeWarning,
                stacklevel=2,
            )
            emit({"type": "paragraph", "text": stripped})
            i += 1
            continue

        # Default: paragraph
        emit({"type": "paragraph", "text": stripped})
        i += 1

    return blocks
