#!/usr/bin/env python3
"""Conformance tests for v2.0 parser extensions (::include, ::cell, ::output).

Feeds fixtures in `examples/v2/parser-fixtures/*.md` through the reference
parser and asserts the expected block-level output.

Run:
    python tests/v2.0/test_parser_v20.py

Exit 0 on all passes; exit 1 on first failure.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "implementations" / "python"))

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from alignment_parser import parse  # noqa: E402

FIXTURES = REPO_ROOT / "examples" / "v2" / "parser-fixtures"


# ---------------------------------------------------------------------------
# ::include tests (v2.0 §12)
# ---------------------------------------------------------------------------

def test_include_local_path() -> None:
    blocks = parse((FIXTURES / "includes.md").read_text(encoding="utf-8"))
    includes = [b for b in blocks if b.get("type") == "include"]
    assert len(includes) == 3, f"expected 3 includes, got {len(includes)}: {includes}"
    # First: plain path
    assert includes[0]["target"] == "appendix.md", includes[0]
    # Second: path + fragment
    assert includes[1]["target"] == "chapter-2.md", includes[1]
    assert includes[1].get("fragment") == "#section-3", includes[1]
    # Third: mdx:// target with content_hash
    assert includes[2]["target"].startswith("mdx://"), includes[2]
    assert includes[2].get("content_hash") == "sha256:abc123", includes[2]


# ---------------------------------------------------------------------------
# ::cell tests (v2.0 §11)
# ---------------------------------------------------------------------------

def test_cell_basic_structure() -> None:
    blocks = parse((FIXTURES / "cell-basic.md").read_text(encoding="utf-8"))
    cells = [b for b in blocks if b.get("type") == "cell"]
    assert len(cells) == 1, cells
    cell = cells[0]
    assert cell["language"] == "python"
    assert cell["kernel"] == "python3"
    assert cell["execution_count"] == 1
    # Source should contain the Python source code, not the fence markers
    assert "x = 2 + 3" in cell["source"]
    assert "```" not in cell["source"]
    # Exactly one output
    assert len(cell["outputs"]) == 1
    assert cell["outputs"][0]["type"] == "text"
    assert cell["outputs"][0]["body"].strip() == "5"


def test_cell_multiple_outputs() -> None:
    blocks = parse((FIXTURES / "cell-multi-output.md").read_text(encoding="utf-8"))
    cells = [b for b in blocks if b.get("type") == "cell"]
    assert len(cells) == 1
    cell = cells[0]
    assert cell["execution_count"] == 7
    assert len(cell["outputs"]) == 2, cell["outputs"]
    # First output: text
    assert cell["outputs"][0]["type"] == "text"
    assert "mean=" in cell["outputs"][0]["body"]
    # Second output: image with src
    assert cell["outputs"][1]["type"] == "image"
    assert cell["outputs"][1]["mime"] == "image/png"
    assert cell["outputs"][1]["src"] == "assets/images/sine.png"
    # Image output has no inline body (uses src)
    assert "body" not in cell["outputs"][1]


def test_cell_frozen_attribute() -> None:
    blocks = parse((FIXTURES / "cell-frozen.md").read_text(encoding="utf-8"))
    cells = [b for b in blocks if b.get("type") == "cell"]
    assert len(cells) == 1
    cell = cells[0]
    assert cell.get("frozen") is True
    assert cell["language"] == "r"


# ---------------------------------------------------------------------------
# Backward compatibility: v1.1 alignment fixtures still work
# ---------------------------------------------------------------------------

def test_v11_alignment_fixtures_still_pass() -> None:
    """The v2.0 parser changes must not regress v1.1 behavior."""
    alignment_dir = REPO_ROOT / "tests" / "alignment"
    fixture = alignment_dir / "01-basic-alignment.md"
    blocks = parse(fixture.read_text(encoding="utf-8"))
    # Must match the exact expected output from test_parser.py
    classes = [b["classes"] for b in blocks]
    assert classes == [
        ["align-left"],
        ["align-center"],
        ["align-right"],
        ["align-justify"],
    ], classes


# ---------------------------------------------------------------------------
# Comprehensive example round-trip
# ---------------------------------------------------------------------------

def test_comprehensive_example_manifest_validates() -> None:
    """The comprehensive v2.0 example's manifest must be valid JSON
    with the expected v2.0 shape."""
    import json
    import zipfile

    mdx_path = REPO_ROOT / "examples" / "v2" / "comprehensive.mdx"
    assert mdx_path.exists(), (
        f"Missing: {mdx_path}. "
        "Run `python implementations/python/create_v20_example.py` first."
    )
    with zipfile.ZipFile(mdx_path, "r") as zf:
        manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
    assert manifest["mdx_version"] == "2.0.0"
    assert manifest["document"]["profile"].endswith("/api-reference/v1")
    # v2.0 features present
    assert "locales" in manifest["content"]
    assert "variants" in manifest["content"]
    assert "includes" in manifest["content"]
    assert "accessibility" in manifest["document"]
    assert "derived_from" in manifest["document"]
    assert "signatures" in manifest["security"]
    # Locales: en-US, es-ES, ja-JP
    locale_tags = {l["tag"] for l in manifest["content"]["locales"]["available"]}
    assert locale_tags == {"en-US", "es-ES", "ja-JP"}, locale_tags


def test_comprehensive_example_archive_ordering() -> None:
    """Per v2.0 §10.2, manifest.json must be the first entry."""
    import zipfile

    mdx_path = REPO_ROOT / "examples" / "v2" / "comprehensive.mdx"
    with zipfile.ZipFile(mdx_path, "r") as zf:
        names = zf.namelist()
    assert names[0] == "manifest.json", f"expected manifest.json first, got: {names[0]}"
    # document.md should be among the first few entries (entry points)
    assert "document.md" in names[:4], f"entry point should be early: {names[:4]}"


def test_comprehensive_example_content_addressed_duplicate() -> None:
    """Per v2.0 §9.2, when both human-readable and content-addressed
    paths refer to the same bytes, the content-addressed entry must
    be byte-identical to the human-readable one."""
    import zipfile

    mdx_path = REPO_ROOT / "examples" / "v2" / "comprehensive.mdx"
    with zipfile.ZipFile(mdx_path, "r") as zf:
        img_bytes = zf.read("assets/images/cell-fig.png")
        # Find the by-hash entry that matches
        hash_entries = [n for n in zf.namelist() if n.startswith("assets/by-hash/sha256/")]
        assert len(hash_entries) >= 1, "expected at least one content-addressed entry"
        hash_bytes = zf.read(hash_entries[0])
    assert img_bytes == hash_bytes, (
        "Content-addressed entry must be byte-identical to its aliased path"
    )


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

TESTS = [
    test_include_local_path,
    test_cell_basic_structure,
    test_cell_multiple_outputs,
    test_cell_frozen_attribute,
    test_v11_alignment_fixtures_still_pass,
    test_comprehensive_example_manifest_validates,
    test_comprehensive_example_archive_ordering,
    test_comprehensive_example_content_addressed_duplicate,
]


def main() -> int:
    passed = 0
    failed = []
    for test in TESTS:
        name = test.__name__
        try:
            test()
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
