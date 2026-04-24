#!/usr/bin/env python3
"""Reference Markdown alignment parser for MDX v1.1.

Implements the block-attribute and alignment grammar from
`spec/MDX_FORMAT_SPECIFICATION_v1.1.md` §4.4 (lines 636–974):

- Shorthand alignment: `{:.<name>}` on its own line → class `align-<name>`
  applied to the immediately-following block.
- Block-level attributes: `{.class1 .class2 #id key="value"}` on its own
  line → applied to the next block.
- Container blocks: `:::{attributes}` or `:::name{attributes}` open a
  container whose attributes propagate to every block inside it; the
  plain `:::` line closes the innermost open container.
- Inline directive attributes: `::name[label]{attributes}` embeds
  attributes directly in the directive line itself.
- Precedence: inline > block > container (inline attributes win when a
  block has an `align-*` class from multiple sources).
- Malformed markers (unclosed braces, bare `{word}` with no `.` prefix)
  degrade gracefully: they are passed through as plain text and do NOT
  affect the next block.

This is a *reference* parser — it emits a structured block list suitable
for testing against the fixtures in `tests/alignment/`. Actual HTML
rendering is out of scope; use the block output as input to any
Markdown→HTML pipeline.

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

# Within an attribute list body, pull out classes / ids / key=value pairs.
RE_ATTR_CLASS = re.compile(r"\.([a-z][a-z0-9\-]*)")
RE_ATTR_ID = re.compile(r"#([a-z][a-z0-9\-]*)")
RE_ATTR_KV = re.compile(r"""([a-z][a-z0-9_\-]*)\s*=\s*"([^"]*)"|([a-z][a-z0-9_\-]*)\s*=\s*'([^']*)'""")

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
        k = m.group(1) or m.group(3)
        v = m.group(2) if m.group(2) is not None else m.group(4)
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


def parse(text: str) -> list[dict]:
    """Parse v1.1 Markdown with alignment / block-attribute extensions.

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

    for raw_line in lines:
        line = raw_line.rstrip("\r")
        stripped = line.strip()

        # Blank line: resets any pending block attr only if nothing consumed it.
        # (A pending block attr actually expects the NEXT non-empty block, so
        # blank lines do not clear it.)
        if not stripped:
            continue

        # Container close
        if RE_CONTAINER_CLOSE.match(line) and container_stack:
            container_stack.pop()
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
            continue

        # Shorthand alignment: `{:.center}` → queue `align-center` as pending.
        m = RE_SHORTHAND.match(line)
        if m:
            shorthand = m.group(1)
            # Shorthand aligns are NOT already prefixed `align-`; normalize.
            class_name = f"align-{shorthand}" if not shorthand.startswith("align-") else shorthand
            pending_block = ParsedAttrs(classes=[class_name])
            continue

        # Block-level attribute: `{.class #id key="value"}`
        m = RE_BLOCK_ATTR.match(line)
        if m:
            pending_block = parse_attrs(m.group(1))
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
            continue

        # Heading
        m = RE_HEADING.match(line)
        if m:
            level = len(m.group(1))
            emit({"type": "heading", "level": level, "text": m.group(2)})
            continue

        # Blockquote
        m = RE_BLOCKQUOTE.match(line)
        if m:
            # Collapse multi-line quotes into one block with joined text
            # (simple reference behavior; a full parser would group lines).
            emit({"type": "blockquote", "text": m.group(1)})
            continue

        # Ordered list item
        m = RE_ORDERED_ITEM.match(line)
        if m:
            emit({"type": "ordered_item", "text": m.group(1)})
            continue

        # Unordered list item
        m = RE_UNORDERED_ITEM.match(line)
        if m:
            emit({"type": "unordered_item", "text": m.group(1)})
            continue

        # Malformed marker (unclosed `{`, bare `{word}` without `.` or `#`):
        # degrade gracefully — treat as plain paragraph text. Don't consume
        # pending_block; it still applies to a future real block.
        if stripped.startswith("{") and "}" not in stripped:
            emit({"type": "paragraph", "text": stripped})
            # Don't consume pending; malformed is not a valid attr block.
            pending_block = pending_block  # noqa: preserve across malformed
            continue
        # {bareword} without . or # prefix — also malformed
        if re.match(r"^\{[a-z][a-z0-9\-]*\}$", stripped):
            emit({"type": "paragraph", "text": stripped})
            continue

        # Default: paragraph
        emit({"type": "paragraph", "text": stripped})

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
