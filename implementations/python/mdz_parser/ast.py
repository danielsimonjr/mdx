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

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ParsedAttrs:
    """Parsed contents of a `{...}` or `[...]` attribute body."""

    classes: list[str] = field(default_factory=list)
    id: str | None = None
    kv: dict[str, str] = field(default_factory=dict)

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
