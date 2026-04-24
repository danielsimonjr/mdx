"""AST node definitions for the MDZ parser.

All nodes are plain dicts for easy JSON serialization (matches the shape
expected by the conformance suite's `.expected.json` files). A dataclass
layer exists for type-checking convenience but always serializes via
`to_dict()`.

Shape reference:

    heading:        {"type": "heading", "level": 1..6, "text": str, "classes": [...], "id"?: str}
    paragraph:      {"type": "paragraph", "text": str, "classes": [...], "id"?: str}
    blockquote:     {"type": "blockquote", "text": str, "classes": [...], "id"?: str}
    ordered_item:   {"type": "ordered_item", "text": str, "classes": [...], "id"?: str}
    unordered_item: {"type": "unordered_item", "text": str, "classes": [...], "id"?: str}
    directive:      {"type": "directive", "name": str, "label"?: str, "src"?: str, "classes": [...], "id"?: str}
    include:        {"type": "include", "target": str, "fragment"?: str, "content_hash"?: str, "classes": [...], "id"?: str}
    cell:           {
                       "type": "cell",
                       "language": str,
                       "kernel": str,
                       "source": str,
                       "outputs": [{"type": str, "mime"?: str, "src"?: str, "body"?: str}],
                       "execution_count"?: int,
                       "frozen"?: bool,
                       "classes": [...],
                       "id"?: str
                    }
    figure:         {"type": "figure", "id": str, "body": [...], "classes": [...]}   # v2.1
    equation:       {"type": "equation", "id": str, "body": str, "classes": [...]}   # v2.1
    table:          {"type": "table", "id": str, "body": [...], "classes": [...]}    # v2.1

Every block carries a `classes: list[str]` and optional `id: str`. The
resolver enforces alignment precedence: inline > block > container.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


# Shared identifier pattern — matches the IDENT production in the ABNF
# grammar. Kept here (rather than imported from parser.py) to avoid a
# circular import with the parser module.
_IDENT_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]*$")


@dataclass
class ParsedAttrs:
    """Parsed contents of a `{...}` or `[...]` attribute body.

    Construction validation: `id` and each class name must match the
    IDENT production (`[A-Za-z][A-Za-z0-9_-]*`). Invalid values raise
    ValueError at construction time rather than producing an AST that
    looks valid but references identifiers no cross-referencer can
    resolve.

    Internal to the parser — callers outside `mdz_parser` should not
    construct ParsedAttrs directly; use `parse()` and inspect the
    resulting AST.
    """

    classes: list[str] = field(default_factory=list)
    id: str | None = None
    kv: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        # Validate id format. Empty string is acceptable (treat as "no id");
        # whitespace-only and ill-formed strings are not.
        if self.id is not None and self.id != "":
            if not _IDENT_RE.match(self.id):
                raise ValueError(
                    f"ParsedAttrs id={self.id!r} is not a valid identifier "
                    f"(must match [A-Za-z][A-Za-z0-9_-]*)"
                )
        # Validate class names — CSS class semantics are looser than
        # IDENT in the real world (e.g., Tailwind uses `:`, `/`, `%`),
        # but our spec's attr-body grammar uses IDENT for classes. Reject
        # anything that wouldn't parse back.
        for cls in self.classes:
            if not _IDENT_RE.match(cls):
                raise ValueError(
                    f"ParsedAttrs class={cls!r} is not a valid identifier "
                    f"(must match [A-Za-z][A-Za-z0-9_-]*)"
                )

    def extend(self, other: "ParsedAttrs") -> "ParsedAttrs":
        """Merge `other` underneath self — self's values win on conflict.

        Used to layer container → block → inline attributes with the
        correct precedence (inline wins).
        """
        return ParsedAttrs(
            classes=list(other.classes) + list(self.classes),
            id=self.id or other.id,
            kv={**other.kv, **self.kv},
        )
