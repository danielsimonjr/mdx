#!/usr/bin/env python3
"""Bootstrap conformance fixtures by parsing a bundled catalog of MDZ
input snippets and writing the resulting AST to `.expected.json` files.

Run once to generate the initial fixture set; re-run only when the
catalog below changes or a grammar revision is intentional.

Usage:
    python tests/conformance/bootstrap_fixtures.py

Safety: this script writes BOTH the `.md` input AND the `.expected.json`
from the same run, so `expected.json` always reflects the current parser
behavior. If the parser regresses later, the existing expected files
catch it — but DO NOT rerun this script to "fix" a regression. Fix the
parser instead.
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

from mdz_parser import parse, ParseError  # noqa: E402

FIXTURE_DIR = REPO_ROOT / "tests" / "conformance"

# ---------------------------------------------------------------------------
# Positive fixtures — parser MUST accept; expected AST derived from parse()
# ---------------------------------------------------------------------------

POSITIVE_FIXTURES: dict[str, str] = {
    "empty-document.md": "",
    "single-heading.md": "# A Heading\n",
    "heading-levels.md": "# L1\n## L2\n### L3\n#### L4\n##### L5\n###### L6\n",
    "paragraph-plain.md": "This is a plain paragraph.\n",
    "paragraph-multiline.md": "Line one.\nLine two.\nLine three.\n",
    "shorthand-center.md": "{:.center}\nCentered paragraph.\n",
    "shorthand-right.md": "{:.right}\nRight-aligned.\n",
    "block-attr-class.md": "{.highlight}\nSome paragraph.\n",
    "block-attr-id.md": "{#section-1}\nIntro paragraph.\n",
    "block-attr-mixed.md": '{.callout #intro key="value"}\nA paragraph.\n',
    "container-simple.md": ":::{.note}\nInside the container.\n:::\n",
    "container-named.md": ":::note\nNamed directive container.\n:::\n",
    "container-nested.md": ":::{.outer}\nOuter.\n:::{.inner}\nInner.\n:::\n:::\n",
    "unordered-list.md": "- First\n- Second\n- Third\n",
    "ordered-list.md": "1. First\n2. Second\n3. Third\n",
    "blockquote.md": "> Quoted text.\n",
    "inline-directive-video.md": '::video[Demo]{src="demo.mp4"}\n',
    "inline-directive-audio.md": '::audio[Theme]{src="theme.mp3"}\n',
    "cell-minimal.md": (
        '::cell{language="python" kernel="python3"}\n'
        "```python\n"
        "x = 1\n"
        "```\n"
        '\n::output{type="text"}\n'
        "```\n"
        "1\n"
        "```\n"
    ),
    "cell-with-exec-count.md": (
        '::cell{language="python" kernel="python3" execution_count=42}\n'
        "```python\n"
        'print("hello")\n'
        "```\n"
        '\n::output{type="text"}\n'
        "```\n"
        "hello\n"
        "```\n"
    ),
    "cell-frozen.md": (
        '::cell{language="r" kernel="r4" frozen="true"}\n'
        "```r\n"
        "x <- 1\n"
        "```\n"
        '\n::output{type="text"}\n'
        "```\n"
        "x = 1\n"
        "```\n"
    ),
    "cell-image-output.md": (
        '::cell{language="python" kernel="python3"}\n'
        "```python\n"
        "import matplotlib\n"
        "```\n"
        '\n::output{type="image" mime="image/png" src="assets/images/fig.png"}\n'
    ),
    "include-local.md": '::include[target="appendix.md"]\n',
    "include-with-fragment.md": '::include[target="chapter.md" fragment="#conclusion"]\n',
    "include-with-hash.md": (
        '::include[target="mdx://urn:mdx:doc:shared/content.md"]'
        '{content_hash="sha256:abc"}\n'
    ),
    "figure-labeled.md": (
        '::fig{id="fig-1"}\n'
        "\n"
        "![caption](assets/fig.png)\n"
    ),
    "equation-labeled.md": (
        '::eq{id="eq-1"}\n'
        "\n"
        "E = mc^2\n"
    ),
    "table-labeled.md": (
        '::tab{id="tab-1"}\n'
        "\n"
        "| a | b |\n"
    ),
    "alignment-precedence.md": (
        ":::{.align-left}\n"
        "{:.right}\n"
        "Should be right (inline wins).\n"
        ":::\n"
    ),
    "malformed-passthrough.md": "{bareword}\nThis paragraph follows.\n",
    "unicode-basic.md": "# 日本語 — 한글 — العربية\n\nParagraph with emoji 🎉 and math ∀.\n",
    "rtl-text.md": "{:.right}\nمرحبا بالعالم\n",
    "deep-container-nesting.md": (
        ":::{.a}\n"
        ":::{.b}\n"
        ":::{.c}\n"
        ":::{.d}\n"
        "Deep content.\n"
        ":::\n:::\n:::\n:::\n"
    ),
}


# ---------------------------------------------------------------------------
# Negative fixtures — parser MUST reject with specific error
# ---------------------------------------------------------------------------

NEGATIVE_FIXTURES: list[tuple[str, str, str, int]] = [
    # (filename, input, error_contains, line)
    (
        "cell-unterminated-fence.md",
        '::cell{language="python" kernel="python3"}\n```python\nx=1\n',
        "unterminated fenced code block",
        2,
    ),
    (
        "cell-empty-source.md",
        '::cell{language="python" kernel="python3"}\n\n(no fence)\n',
        "fenced source code block",
        1,
    ),
    (
        "include-empty-target.md",
        '::include[target=""]\n',
        "non-empty `target`",
        1,
    ),
    (
        "output-missing-type.md",
        (
            '::cell{language="python" kernel="python3"}\n'
            "```python\nx=1\n```\n\n::output{}\n```\nhi\n```\n"
        ),
        "requires an explicit",
        6,
    ),
    (
        "cell-bad-exec-count.md",
        (
            '::cell{language="python" kernel="python3" execution_count="nope"}\n'
            "```python\nx=1\n```\n\n"
            '::output{type="text"}\n```\nhi\n```\n'
        ),
        "execution_count must be an integer",
        1,
    ),
    (
        "output-empty-body.md",
        (
            '::cell{language="python" kernel="python3"}\n'
            "```python\nx=1\n```\n\n"
            '::output{type="text"}\n'
        ),
        "inline fenced body",
        6,
    ),
    (
        "fig-missing-id.md",
        '::fig{caption="no id"}\n\n![img](fig.png)\n',
        "requires a non-empty `id",
        1,
    ),
    (
        "eq-missing-id.md",
        "::eq{}\n\nE = mc^2\n",
        "requires a non-empty `id",
        1,
    ),
]


# ---------------------------------------------------------------------------
# Edge fixtures — unusual but legal inputs
# ---------------------------------------------------------------------------

EDGE_FIXTURES: dict[str, str] = {
    "long-paragraph.md": "word " * 500 + "\n",
    "many-blank-lines.md": "# Title\n\n\n\n\n\n\n\nParagraph.\n",
    "crlf-line-endings.md": "# Heading\r\n\r\nParagraph.\r\n",
    "mixed-line-endings.md": "# Title\n\nPara1.\r\nPara2.\n",
    "surrogate-pair-emoji.md": "# Emoji 🫥🏳️‍🌈\n\n👨‍👩‍👧‍👦 family.\n",
    "only-whitespace.md": "   \n\t\n  \n",
    "directive-without-attrs.md": "::note\nJust a note.\n:::\n",
    "many-classes.md": (
        "{.c1 .c2 .c3 .c4 .c5 .c6 .c7 .c8}\n"
        "Multi-class paragraph.\n"
    ),
}


# ---------------------------------------------------------------------------
# Writer
# ---------------------------------------------------------------------------


def _write_positive(category: str, name: str, text: str) -> None:
    dir_ = FIXTURE_DIR / category
    dir_.mkdir(parents=True, exist_ok=True)
    (dir_ / name).write_text(text, encoding="utf-8")
    ast = parse(text)
    (dir_ / (Path(name).stem + ".expected.json")).write_text(
        json.dumps(ast, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _write_negative(name: str, text: str, needle: str, line: int) -> None:
    dir_ = FIXTURE_DIR / "negative"
    dir_.mkdir(parents=True, exist_ok=True)
    (dir_ / name).write_text(text, encoding="utf-8")
    # Verify the parser actually raises with the expected error
    try:
        parse(text)
        raise RuntimeError(f"{name}: parser accepted input that should fail")
    except ParseError as e:
        if needle not in str(e):
            raise RuntimeError(
                f"{name}: error message doesn't contain {needle!r}: got {e}"
            )
        if e.line != line:
            raise RuntimeError(
                f"{name}: line mismatch; expected {line}, got {e.line}"
            )
    (dir_ / (Path(name).stem + ".expected-error.json")).write_text(
        json.dumps({"error_contains": needle, "line": line}, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    print("Bootstrapping positive fixtures...")
    for name, text in POSITIVE_FIXTURES.items():
        _write_positive("positive", name, text)
        print(f"  wrote positive/{name}")

    print("\nBootstrapping roundtrip fixtures...")
    # Roundtrip = a curated subset of positive that we want to explicitly
    # lock-in for roundtrip semantics (same inputs, same category as positive).
    for name in ["cell-minimal.md", "include-local.md", "container-nested.md"]:
        _write_positive("roundtrip", name, POSITIVE_FIXTURES[name])
        print(f"  wrote roundtrip/{name}")

    print("\nBootstrapping negative fixtures...")
    for name, text, needle, line in NEGATIVE_FIXTURES:
        _write_negative(name, text, needle, line)
        print(f"  wrote negative/{name}")

    print("\nBootstrapping edge fixtures...")
    for name, text in EDGE_FIXTURES.items():
        _write_positive("edge", name, text)
        print(f"  wrote edge/{name}")

    total = (
        len(POSITIVE_FIXTURES)
        + len(NEGATIVE_FIXTURES)
        + len(EDGE_FIXTURES)
        + 3  # roundtrip
    )
    print(f"\nTotal: {total} fixtures written.")


if __name__ == "__main__":
    main()
