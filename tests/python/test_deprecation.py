#!/usr/bin/env python3
"""Test the compute_checksum / compute_content_hash deprecation contract.

The previous implementation used a module-global once-flag that
suppressed the warning after first call AND bypassed user-configured
warning filters. This test pins the corrected behavior:

  - compute_checksum MUST emit a DeprecationWarning
  - compute_content_hash MUST NOT emit a DeprecationWarning
  - Under warnings.simplefilter("always"), every compute_checksum call
    emits a warning (no suppressing once-flag)
  - Under the stdlib default filter ("default"), a DeprecationWarning
    from the same location fires once per (module, lineno) — which is
    the stdlib's job, not ours
"""

from __future__ import annotations

import io
import sys
import warnings
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "implementations" / "python"))

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import mdx_format  # noqa: E402


def test_compute_checksum_warns_every_call_under_always_filter() -> None:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        mdx_format.compute_checksum(b"a")
        mdx_format.compute_checksum(b"b")
        mdx_format.compute_checksum(b"c")
    dep = [w for w in caught if issubclass(w.category, DeprecationWarning)]
    assert len(dep) == 3, f"expected 3 DeprecationWarnings under always-filter, got {len(dep)}"


def test_compute_content_hash_is_silent() -> None:
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        mdx_format.compute_content_hash(b"a")
        mdx_format.compute_content_hash(b"b")
    dep = [w for w in caught if issubclass(w.category, DeprecationWarning)]
    assert len(dep) == 0, f"compute_content_hash should not emit warnings; got {len(dep)}"


def test_compute_checksum_output_format() -> None:
    out = mdx_format.compute_checksum(b"abc")
    assert out.startswith("sha256:"), f"missing sha256: prefix in {out!r}"
    # Known sha256 vector for "abc".
    assert out == "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_compute_content_hash_matches_checksum_bytes() -> None:
    """The v2 rename does not change the hash, only the field name."""
    # Swallow the deprecation so the assertion isn't polluted.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        legacy = mdx_format.compute_checksum(b"hello world")
    v2 = mdx_format.compute_content_hash(b"hello world")
    assert legacy == v2, "content_hash and checksum compute different values"


if __name__ == "__main__":
    passes = 0
    fails = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  [PASS] {name}")
                passes += 1
            except AssertionError as e:
                print(f"  [FAIL] {name}: {e}")
                fails += 1
    print(f"\n  Passed: {passes}, Failed: {fails}")
    sys.exit(1 if fails else 0)
