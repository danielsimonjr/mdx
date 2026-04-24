"""Parse error type with line-number reporting."""

from __future__ import annotations


class ParseError(ValueError):
    """Raised on structural errors in MDZ directives.

    Carries a 1-based line number so callers can surface precise
    diagnostics. Silent fallback for v2.0+ directives is forbidden per
    the grammar's normative constraints — we fail loud instead of masking
    data loss.
    """

    def __init__(self, message: str, line: int) -> None:
        super().__init__(f"line {line}: {message}")
        self.line = line
        self.message = message
