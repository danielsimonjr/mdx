#!/usr/bin/env python3
"""Reference Markdown parser for MDX v1.1 + v2.0.

Implements the block-attribute and alignment grammar from
`spec/MDX_FORMAT_SPECIFICATION_v1.1.md` §4.4 plus the v2.0 directives
(`::cell`, `::output`, `::include`) from
`spec/MDX_FORMAT_SPECIFICATION_v2.0.md` §11 and §12.

v1.1 block-attribute grammar:

- Shorthand alignment: `{:.<name>}` on its own line → class `align-<name>`
  applied to the immediately-following block.
- Block-level attributes: `{.class1 .class2 #id key="value"}` on its own
  line → applied to the next block.
- Container blocks: `:::{attributes}` or `:::name{attributes}` open a
  container whose attributes propagate to every block inside it; the
  plain `:::` line closes the innermost open container.
- Inline directive attributes: `::name[label]{attributes}` embeds
  attributes directly in the directive line itself.
- Precedence: inline > block > container.
- Malformed *attribute* markers (unclosed braces, bare `{word}` with no
  `.` prefix) degrade gracefully: passed through as plain text.

v2.0 directive grammar (strict — errors are raised, not absorbed):

- `::cell{...}` followed by a fenced code block is the source.
- Zero or more `::output{type="..."}` blocks may follow, each with its
  own fenced code block (unless an inline resource like `src=...` is
  given, in which case the fence is optional).
- `::include[key="value" ...]{...}` declares a transclusion target.

Structural errors in v2.0 directives raise `ParseError` with a line
number rather than being silently absorbed. This is intentional — v1.1
chose graceful degradation because attribute markers are optional; v2.0
directives carry semantic payload (executable code, external resources)
where a silent parse failure would mask data loss.

This is a *reference* parser — it emits a structured block list suitable
for testing against the fixtures in `tests/alignment/` and
`examples/v2/parser-fixtures/`. Actual HTML rendering is out of scope.

Output shape:

    [
        {"type": "paragraph", "classes": ["align-center"], "text": "..."},
        {"type": "heading", "level": 1, "classes": [], "text": "..."},
        {"type": "list_item", "classes": ["align-right"], "text": "..."},
        {"type": "blockquote", "classes": [...], "text": "..."},
        {"type": "directive", "name": "video", "classes": [...], "label": "Demo", "src": "..."},
        ...
    ]

Usage:

    from alignment_parser import parse
    blocks = parse(text)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ParseError(ValueError):
    """Raised on structural errors in v2.0 directives.

    Carries a 1-based line number so callers can surface precise
    diagnostics. Silent fallback for v2.0 directives would mask data
    loss (lost code cells, broken transclusions); we fail loud instead.
    """

    def __init__(self, message: str, line: int) -> None:
        super().__init__(f"line {line}: {message}")
        self.line = line
        self.message = message


# ---------------------------------------------------------------------------
# Regexes
# ---------------------------------------------------------------------------

# Shorthand alignment on own line: `{:.center}`
RE_SHORTHAND = re.compile(r"^\s*\{:\.([a-z][a-z0-9\-]*)\}\s*$")

# Block-level attribute on own line: `{.class #id key="value"}`
# Requires at least one `.`-prefixed class or `#`-prefixed id to count
# (prevents matching `{word}` as an attr block — that's malformed).
RE_BLOCK_ATTR = re.compile(
    r"""^\s*\{
        (?=[^}]*[.#])            # must contain a . or # inside
        ([^}\n]+)                # capture the attribute list
        \}\s*$""",
    re.VERBOSE,
)

# Container block open: `:::{attributes}` or `:::name{attributes}`.
# Accepts 3+ colons per CommonMark directive extension convention.
RE_CONTAINER_OPEN = re.compile(
    r"""^\s*(?P<colons>:{3,})
        (?P<name>[a-z][a-z0-9\-]*)?
        (?:\{(?P<attrs>[^}]*)\})?
        \s*$""",
    re.VERBOSE,
)

# Container close: `:::` alone on a line (3+ colons).
RE_CONTAINER_CLOSE = re.compile(r"^\s*:{3,}\s*$")

# Inline directive: `::name[label]{attributes}`.
RE_INLINE_DIRECTIVE = re.compile(
    r"""^\s*::(?P<name>[a-z][a-z0-9\-]*)
        (?:\[(?P<label>[^\]]*)\])?
        (?:\{(?P<attrs>[^}]*)\})?
        \s*$""",
    re.VERBOSE,
)

# v2.0 ::cell opening: `::cell{language="..." kernel="..."}`
RE_CELL_OPEN = re.compile(
    r"""^\s*::cell(?:\{(?P<attrs>[^}]*)\})?\s*$""",
    re.VERBOSE,
)

# v2.0 ::output block header: `::output{type="text" mime="..." src="..."}`
RE_OUTPUT_OPEN = re.compile(
    r"""^\s*::output(?:\{(?P<attrs>[^}]*)\})?\s*$""",
    re.VERBOSE,
)

# Fenced code block opener/closer: ``` or ```lang
RE_FENCE = re.compile(r"^\s*```(?P<lang>[a-zA-Z0-9_\-]*)\s*$")

# Within an attribute list body, pull out classes / ids / key=value pairs.
RE_ATTR_CLASS = re.compile(r"\.([a-z][a-z0-9\-]*)")
RE_ATTR_ID = re.compile(r"#([a-z][a-z0-9\-]*)")
RE_ATTR_KV = re.compile(
    r"""(?P<k1>[a-z][a-z0-9_\-]*)\s*=\s*"(?P<v1>[^"]*)"
      | (?P<k2>[a-z][a-z0-9_\-]*)\s*=\s*'(?P<v2>[^']*)'
      | (?P<k3>[a-z][a-z0-9_\-]*)\s*=\s*(?P<v3>[A-Za-z0-9_][A-Za-z0-9_\-.]*)""",
    re.VERBOSE,
)

# Heading: `# text` through `###### text`.
RE_HEADING = re.compile(r"^\s*(#{1,6})\s+(.*?)\s*$")

# Blockquote line.
RE_BLOCKQUOTE = re.compile(r"^\s*>\s?(.*)$")

# Ordered list item.
RE_ORDERED_ITEM = re.compile(r"^\s*\d+\.\s+(.+)$")

# Unordered list item.
RE_UNORDERED_ITEM = re.compile(r"^\s*[-*+]\s+(.+)$")


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class ParsedAttrs:
    """Parsed contents of a `{...}` attribute block or directive attrs."""

    classes: list[str] = field(default_factory=list)
    id: str | None = None
    kv: dict[str, str] = field(default_factory=dict)

    def extend(self, other: "ParsedAttrs") -> "ParsedAttrs":
        merged = ParsedAttrs(
            classes=list(other.classes) + list(self.classes),
            id=self.id or other.id,
            kv={**other.kv, **self.kv},
        )
        return merged


def parse_attrs(body: str) -> ParsedAttrs:
    """Parse the inside of `{...}` into classes/id/key-value pairs.

    Shorthand `:.name` is normalized to class `align-name` by the caller
    (since the shorthand appears outside this body, as `{:.name}`).

    Order of extraction matters: quoted values (`src="demo.mp4"`) must
    be extracted first so that `.mp4` inside a quoted string is NOT
    picked up as a class.
    """
    # First, extract all key=value pairs and their spans, then strip them
    # from a working copy of the body before hunting for classes/ids.
    kv: dict[str, str] = {}
    masked = body
    for m in list(RE_ATTR_KV.finditer(body)):
        k = m.group("k1") or m.group("k2") or m.group("k3")
        v = m.group("v1") if m.group("v1") is not None else (
            m.group("v2") if m.group("v2") is not None else m.group("v3")
        )
        if k is not None and v is not None:
            kv[k] = v
        # Blank out the whole match in `masked` so class/id regexes can't
        # accidentally match inside quoted values.
        start, end = m.span()
        masked = masked[:start] + (" " * (end - start)) + masked[end:]

    classes = [m.group(1) for m in RE_ATTR_CLASS.finditer(masked)]
    ids = [m.group(1) for m in RE_ATTR_ID.finditer(masked)]
    return ParsedAttrs(classes=classes, id=ids[0] if ids else None, kv=kv)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


# Attribute precedence: inline > block > container.
# Implemented by recording a class's source tier; when a block emits, we
# keep the highest-precedence `align-*` class and drop lower-tier
# `align-*` duplicates.
_ALIGN_RE = re.compile(r"^align-")


def _resolve_alignment(
    container_attrs: ParsedAttrs,
    block_attrs: ParsedAttrs,
    inline_attrs: ParsedAttrs,
) -> list[str]:
    """Combine attrs from all three sources and apply precedence.

    The highest-precedence alignment (inline > block > container) wins
    for the `align-*` class. Non-align classes from all sources are
    preserved (union)."""
    align_from_inline = [c for c in inline_attrs.classes if _ALIGN_RE.match(c)]
    align_from_block = [c for c in block_attrs.classes if _ALIGN_RE.match(c)]
    align_from_container = [c for c in container_attrs.classes if _ALIGN_RE.match(c)]
    winner_align = (align_from_inline or align_from_block or align_from_container)[:1]

    non_align = set()
    for src in (container_attrs, block_attrs, inline_attrs):
        for c in src.classes:
            if not _ALIGN_RE.match(c):
                non_align.add(c)

    return winner_align + sorted(non_align)


def _consume_fenced_block(lines: list[str], start: int) -> tuple[str, str, int]:
    """Read a fenced code block starting at `lines[start]`.

    Returns (language, body_joined_with_newlines, next_index_after_close).
    If the opening fence is missing, returns ("", "", start) so callers
    can distinguish "no fence here" from parse error.

    Raises `ParseError` if the opening fence has no matching close — the
    alternative (silently absorbing everything to EOF) would let a
    stray ``` at the top of a document swallow the entire rest of the
    file without the author noticing.
    """
    if start >= len(lines):
        return "", "", start
    m = RE_FENCE.match(lines[start])
    if not m:
        return "", "", start
    lang = m.group("lang") or ""
    body_lines: list[str] = []
    i = start + 1
    while i < len(lines):
        if RE_FENCE.match(lines[i]):
            return lang, "\n".join(body_lines), i + 1
        body_lines.append(lines[i])
        i += 1
    raise ParseError(
        "unterminated fenced code block (opened here, no matching ``` found before EOF)",
        start + 1,
    )


def _skip_blank(lines: list[str], i: int) -> int:
    while i < len(lines) and not lines[i].strip():
        i += 1
    return i


def parse(text: str) -> list[dict]:
    """Parse v1.1 + v2.0 Markdown with alignment, block attributes,
    transclusion, and computational cells.

    Returns a list of block dicts. See module docstring for shape."""
    lines = text.splitlines()
    blocks: list[dict] = []
    container_stack: list[ParsedAttrs] = []
    pending_block: ParsedAttrs | None = None

    def effective_container() -> ParsedAttrs:
        """Merge the container stack top-down so outer container attrs
        are applied but inner-most wins on conflicts (for non-align)."""
        merged = ParsedAttrs()
        for c in container_stack:
            merged = c.extend(merged)  # extend keeps self (outer) as base
        return merged

    def emit(block: dict, inline: ParsedAttrs | None = None) -> None:
        """Attach resolved classes to the block and append to output."""
        nonlocal pending_block
        inline = inline or ParsedAttrs()
        block_attrs = pending_block or ParsedAttrs()
        block["classes"] = _resolve_alignment(effective_container(), block_attrs, inline)
        if block_attrs.id or inline.id:
            block["id"] = inline.id or block_attrs.id
        blocks.append(block)
        pending_block = None

    # Indexed loop so ::cell can consume the fenced code block + ::output
    # blocks that follow it.
    i = 0
    while i < len(lines):
        raw_line = lines[i]
        line = raw_line.rstrip("\r")
        stripped = line.strip()

        # Blank line: resets any pending block attr only if nothing consumed it.
        # (A pending block attr actually expects the NEXT non-empty block, so
        # blank lines do not clear it.)
        if not stripped:
            i += 1
            continue

        # Container close
        if RE_CONTAINER_CLOSE.match(line) and container_stack:
            container_stack.pop()
            i += 1
            continue

        # Container open: `:::{attrs}` or `:::name{attrs}` or `:::name`
        m = RE_CONTAINER_OPEN.match(line)
        if m and (m.group("attrs") is not None or m.group("name") is not None):
            # Avoid matching a bare `:::` alone as an open (that's a close)
            # when container_stack is non-empty — guarded above.
            attrs_body = m.group("attrs") or ""
            container_attrs = parse_attrs(attrs_body)
            if m.group("name"):
                # Named directive container (e.g., `:::note`) — the name
                # itself is not a class, but we tag it in kv for downstream use.
                container_attrs.kv.setdefault("_directive", m.group("name"))
            container_stack.append(container_attrs)
            i += 1
            continue

        # Shorthand alignment: `{:.center}` → queue `align-center` as pending.
        m = RE_SHORTHAND.match(line)
        if m:
            shorthand = m.group(1)
            # Shorthand aligns are NOT already prefixed `align-`; normalize.
            class_name = f"align-{shorthand}" if not shorthand.startswith("align-") else shorthand
            pending_block = ParsedAttrs(classes=[class_name])
            i += 1
            continue

        # Block-level attribute: `{.class #id key="value"}`
        m = RE_BLOCK_ATTR.match(line)
        if m:
            pending_block = parse_attrs(m.group(1))
            i += 1
            continue

        # v2.0 — ::cell directive: source code + zero or more ::output blocks
        m = RE_CELL_OPEN.match(line)
        if m:
            cell_line = i + 1  # 1-based for diagnostics
            cell_attrs = parse_attrs(m.group("attrs") or "")
            source_lang = ""
            source_body = ""
            cell_outputs: list[dict] = []

            # Skip blanks, then require a fenced source block.
            j = _skip_blank(lines, i + 1)
            if j >= len(lines) or not RE_FENCE.match(lines[j]):
                raise ParseError(
                    "::cell requires a fenced source code block immediately "
                    "after the directive (found EOF or non-fence line)",
                    cell_line,
                )
            source_lang, source_body, j = _consume_fenced_block(lines, j)
            if not source_body.strip():
                raise ParseError(
                    "::cell source block is empty; empty cells are not valid "
                    "(use `frozen=\"true\"` with an explicit source if you "
                    "want a placeholder)",
                    cell_line,
                )

            # Consume zero or more ::output{} blocks, each optionally followed
            # by a fenced code block.
            while True:
                j2 = _skip_blank(lines, j)
                if j2 >= len(lines):
                    j = j2
                    break
                om = RE_OUTPUT_OPEN.match(lines[j2])
                if not om:
                    j = j2
                    break
                output_line = j2 + 1
                output_attrs = parse_attrs(om.group("attrs") or "")
                if "type" not in output_attrs.kv:
                    raise ParseError(
                        "::output requires an explicit `type=\"...\"` "
                        "attribute (e.g., text, image, html, json); silent "
                        "defaulting would mask author/tool disagreement",
                        output_line,
                    )
                j3 = _skip_blank(lines, j2 + 1)
                out_body = ""
                if j3 < len(lines) and RE_FENCE.match(lines[j3]):
                    _, out_body, j3 = _consume_fenced_block(lines, j3)
                # If no body and no src, the output block is semantically empty.
                if not out_body and not output_attrs.kv.get("src"):
                    raise ParseError(
                        "::output must have either an inline fenced body or "
                        "an `src=\"...\"` attribute; empty output blocks are "
                        "not valid",
                        output_line,
                    )
                output_block: dict = {"type": output_attrs.kv["type"]}
                if output_attrs.kv.get("mime"):
                    output_block["mime"] = output_attrs.kv["mime"]
                if output_attrs.kv.get("src"):
                    output_block["src"] = output_attrs.kv["src"]
                if out_body:
                    output_block["body"] = out_body
                cell_outputs.append(output_block)
                j = j3

            cell_block = {
                "type": "cell",
                "language": cell_attrs.kv.get("language", source_lang or ""),
                "kernel": cell_attrs.kv.get("kernel", ""),
                "source": source_body,
                "outputs": cell_outputs,
            }
            if "execution_count" in cell_attrs.kv:
                raw = cell_attrs.kv["execution_count"]
                try:
                    cell_block["execution_count"] = int(raw)
                except ValueError:
                    raise ParseError(
                        f"::cell execution_count must be an integer, "
                        f"got {raw!r}",
                        cell_line,
                    )
            if cell_attrs.kv.get("frozen") == "true":
                cell_block["frozen"] = True
            emit(cell_block, inline=cell_attrs)
            i = j
            continue

        # v2.0 — ::include directive (transclusion)
        # Per spec §12.2, ::include uses `[key="value" key="value"]`
        # for its configuration (a departure from standard directive
        # label syntax), optionally combined with `{...}` for additional
        # attrs like content_hash.
        m_inc = RE_INLINE_DIRECTIVE.match(line)
        if m_inc and m_inc.group("name") == "include":
            include_line = i + 1
            # Parse both the bracket body (as key=value) AND the brace body.
            bracket_attrs = parse_attrs(m_inc.group("label") or "")
            brace_attrs = parse_attrs(m_inc.group("attrs") or "")
            combined_kv = {**bracket_attrs.kv, **brace_attrs.kv}
            target = combined_kv.get("target") or combined_kv.get("path") or ""
            if not target.strip():
                raise ParseError(
                    "::include requires a non-empty `target` (or `path`) "
                    "attribute; silently accepting would produce an include "
                    "block pointing nowhere",
                    include_line,
                )
            include_block: dict = {
                "type": "include",
                "target": target,
            }
            if combined_kv.get("fragment"):
                include_block["fragment"] = combined_kv["fragment"]
            if combined_kv.get("content_hash"):
                include_block["content_hash"] = combined_kv["content_hash"]
            # Classes come only from the {...} brace form
            emit(include_block, inline=brace_attrs)
            i += 1
            continue

        # Inline directive: `::video[label]{attrs}` on own line
        m = RE_INLINE_DIRECTIVE.match(line)
        if m:
            inline_attrs = parse_attrs(m.group("attrs") or "")
            block = {
                "type": "directive",
                "name": m.group("name"),
                "label": m.group("label") or "",
            }
            # Expose src from kv as a convenience (common case)
            if "src" in inline_attrs.kv:
                block["src"] = inline_attrs.kv["src"]
            emit(block, inline=inline_attrs)
            i += 1
            continue

        # Heading
        m = RE_HEADING.match(line)
        if m:
            level = len(m.group(1))
            emit({"type": "heading", "level": level, "text": m.group(2)})
            i += 1
            continue

        # Blockquote
        m = RE_BLOCKQUOTE.match(line)
        if m:
            # Collapse multi-line quotes into one block with joined text
            # (simple reference behavior; a full parser would group lines).
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

        # Malformed marker (unclosed `{`, bare `{word}` without `.` or `#`):
        # degrade gracefully — treat as plain paragraph text. Don't consume
        # pending_block; it still applies to a future real block.
        if stripped.startswith("{") and "}" not in stripped:
            emit({"type": "paragraph", "text": stripped})
            # Don't consume pending; malformed is not a valid attr block.
            i += 1
            continue
        # {bareword} without . or # prefix — also malformed
        if re.match(r"^\{[a-z][a-z0-9\-]*\}$", stripped):
            emit({"type": "paragraph", "text": stripped})
            i += 1
            continue

        # Default: paragraph
        emit({"type": "paragraph", "text": stripped})
        i += 1

    return blocks


# ---------------------------------------------------------------------------
# CLI entry point (for ad-hoc use)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) != 2:
        print("Usage: alignment_parser.py <input.md>", file=sys.stderr)
        sys.exit(2)
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        content = f.read()
    result = parse(content)
    print(json.dumps(result, indent=2, ensure_ascii=False))
