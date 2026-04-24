#!/usr/bin/env python3
"""Integration test that the CLI accepts both .mdz and .mdx archives.

Backward-compat promise: readers MUST accept both extensions through
2027-01-01. This test exercises the CLI's branch in `cli/src/index.js`
by running the `info` command against both forms of the same archive.
If someone removes the `.endsWith('.mdx')` clause, this test fails.
"""

from __future__ import annotations

import io
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

CLI_ENTRY = REPO_ROOT / "cli" / "src" / "index.js"
SOURCE_MDX = REPO_ROOT / "examples" / "example-document.mdx"


def _run_info(path: Path) -> tuple[int, str]:
    """Run `node cli/src/index.js info <path>` and return (code, combined_output)."""
    proc = subprocess.run(
        ["node", str(CLI_ENTRY), "info", str(path)],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(REPO_ROOT),
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def test_cli_info_accepts_legacy_mdx() -> None:
    """The original extension — must keep working through 2027-01-01."""
    assert SOURCE_MDX.exists(), f"Fixture missing: {SOURCE_MDX}"
    code, output = _run_info(SOURCE_MDX)
    assert code == 0, f"info returned {code}; output:\n{output}"
    assert "MDX Document Information" in output or "MDZ" in output
    assert "Title:" in output


def test_cli_info_accepts_mdz_extension() -> None:
    """Create a .mdz by copying the .mdx fixture — readers MUST treat
    them identically. This catches a regression that would restrict CLI
    input to one extension or the other."""
    assert SOURCE_MDX.exists()
    mdz_copy = REPO_ROOT / "examples" / "_test-dual-extension.mdz"
    try:
        shutil.copy2(SOURCE_MDX, mdz_copy)
        code, output = _run_info(mdz_copy)
        assert code == 0, f"info on .mdz returned {code}; output:\n{output}"
        assert "Title:" in output
    finally:
        if mdz_copy.exists():
            mdz_copy.unlink()


def test_cli_rejects_unknown_extension() -> None:
    """An extension other than .mdz/.mdx should trigger the CLI's help
    path, not silently try to read the file."""
    fake = REPO_ROOT / "examples" / "_test-not-an-archive.xyz"
    try:
        fake.write_bytes(b"not an archive")
        # Default action (no subcommand) with .xyz should print help.
        proc = subprocess.run(
            ["node", str(CLI_ENTRY), str(fake)],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            cwd=str(REPO_ROOT),
        )
        combined = (proc.stdout or "") + (proc.stderr or "")
        # The help text mentions `Usage:` or `Commands:` — confirm we did
        # NOT try to parse the fake file as an archive.
        assert "manifest.json" not in combined, (
            "CLI silently tried to read a non-archive file; dual-extension "
            "branch should gate on .mdz/.mdx specifically."
        )
    finally:
        if fake.exists():
            fake.unlink()


TESTS = [
    test_cli_info_accepts_legacy_mdx,
    test_cli_info_accepts_mdz_extension,
    test_cli_rejects_unknown_extension,
]


def main() -> int:
    # Need the CLI's deps installed
    if not (REPO_ROOT / "cli" / "node_modules").exists():
        print("  [SKIP] cli/node_modules not found; run `cd cli && npm install`")
        return 0
    passed = 0
    failed: list[str] = []
    for t in TESTS:
        name = t.__name__
        try:
            t()
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
