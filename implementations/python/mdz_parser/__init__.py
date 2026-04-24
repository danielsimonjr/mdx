"""MDZ reference parser (Lark-based).

Replaces the ad-hoc regex parser in `alignment_parser.py` with a Lark-backed
grammar derived from `spec/grammar/mdz-directives.abnf`. The state machine
layer handles document-level structure (block order, container nesting,
cell-with-outputs grouping); Lark parses individual directive lines.

Public API:

    from mdz_parser import parse, ParseError
    blocks = parse(markdown_text)

The returned blocks match the AST shape documented in `ast.py`.

Legacy `alignment_parser.py` remains importable through 2027-01-01 for
backward compatibility with callers that haven't migrated. Internally it
is a thin wrapper over this parser.
"""

from .parser import parse, MDZParser, MalformedAttributeWarning
from .errors import ParseError

__all__ = ["parse", "MDZParser", "ParseError", "MalformedAttributeWarning"]

__version__ = "0.1.0"
