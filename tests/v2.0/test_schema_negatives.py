#!/usr/bin/env python3
"""Negative-rejection tests for the v2.0 JSON Schema.

Positive validation is already covered in CI — this file asserts that
*invalid* manifests are rejected. Without these, a schema regression
that accidentally relaxed constraints (removed a `required`, widened
an enum, dropped an `additionalProperties: false`) would slip through
CI unnoticed because the comprehensive example still validates.

Each test constructs a minimally-invalid manifest by starting from a
valid baseline and mutating exactly one field to something the schema
forbids, then asserts ajv-cli returns non-zero.

Requires `ajv-cli` + `ajv-formats` on PATH (the CI job installs them
globally; locally: `npm install -g ajv-cli ajv-formats`).
"""

from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
from copy import deepcopy
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA = REPO_ROOT / "spec" / "manifest-v2.schema.json"

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# A minimal, known-valid v2.0 manifest — each negative test deep-copies
# this and mutates exactly one field. Keep it minimal so the mutations
# stay small and obvious.
VALID_BASELINE: dict = {
    "mdx_version": "2.0.0",
    "document": {
        "id": "12345678-1234-4234-8234-123456789abc",
        "title": "Baseline",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z",
    },
    "content": {
        "entry_point": "document.md",
    },
}


def _find_ajv() -> str | None:
    """Locate ajv on PATH. Supports Windows ajv.cmd."""
    for candidate in ("ajv", "ajv.cmd"):
        found = shutil.which(candidate)
        if found:
            return found
    return None


AJV = _find_ajv()


def _run_ajv(manifest: dict) -> tuple[int, str]:
    """Run ajv validate on `manifest`; return (exit_code, combined_stderr_stdout)."""
    assert AJV is not None, "ajv-cli must be installed for schema tests"
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tf:
        json.dump(manifest, tf)
        tf_path = tf.name
    try:
        proc = subprocess.run(
            [
                AJV,
                "validate",
                "-s",
                str(SCHEMA),
                "-d",
                tf_path,
                "--spec=draft2020",
                "-c",
                "ajv-formats",
            ],
            capture_output=True,
            encoding="utf-8",
            errors="replace",
        )
        return proc.returncode, (proc.stdout or "") + (proc.stderr or "")
    finally:
        os.unlink(tf_path)


def _expect_valid(manifest: dict, label: str) -> None:
    code, output = _run_ajv(manifest)
    assert code == 0, f"{label}: baseline failed validation unexpectedly: {output}"


def _expect_invalid(manifest: dict, label: str) -> None:
    code, output = _run_ajv(manifest)
    assert code != 0, (
        f"{label}: manifest was accepted but should have been rejected.\n"
        f"ajv output:\n{output}"
    )


# ---------------------------------------------------------------------------
# Baseline sanity
# ---------------------------------------------------------------------------

def test_baseline_validates() -> None:
    """Sanity check — the baseline itself must validate."""
    _expect_valid(VALID_BASELINE, "baseline")


# ---------------------------------------------------------------------------
# Required field rejections
# ---------------------------------------------------------------------------

def test_missing_mdx_version() -> None:
    m = deepcopy(VALID_BASELINE)
    del m["mdx_version"]
    _expect_invalid(m, "missing mdx_version")


def test_missing_document_id() -> None:
    m = deepcopy(VALID_BASELINE)
    del m["document"]["id"]
    _expect_invalid(m, "missing document.id")


def test_missing_document_title() -> None:
    m = deepcopy(VALID_BASELINE)
    del m["document"]["title"]
    _expect_invalid(m, "missing document.title")


def test_missing_content_entry_point() -> None:
    m = deepcopy(VALID_BASELINE)
    del m["content"]["entry_point"]
    _expect_invalid(m, "missing content.entry_point")


# ---------------------------------------------------------------------------
# Format / pattern rejections
# ---------------------------------------------------------------------------

def test_non_semver_mdx_version() -> None:
    m = deepcopy(VALID_BASELINE)
    m["mdx_version"] = "2.0"  # missing patch
    _expect_invalid(m, "non-semver mdx_version")


def test_non_uuid_document_id() -> None:
    m = deepcopy(VALID_BASELINE)
    m["document"]["id"] = "not-a-uuid"
    _expect_invalid(m, "non-uuid document.id")


def test_bad_content_hash_algorithm() -> None:
    m = deepcopy(VALID_BASELINE)
    m["document"]["content_id"] = "md5:abc123"  # md5 not in allowed algos
    _expect_invalid(m, "md5 content_id")


def test_bad_did_format() -> None:
    m = deepcopy(VALID_BASELINE)
    m["security"] = {
        "signatures": [
            {
                "role": "author",
                "signer": {"name": "A", "did": "not-a-did"},
                "algorithm": "Ed25519",
                "signature": "sig",
            }
        ]
    }
    _expect_invalid(m, "non-did signer.did")


def test_bad_signature_algorithm() -> None:
    m = deepcopy(VALID_BASELINE)
    m["security"] = {
        "signatures": [
            {
                "role": "author",
                "signer": {"name": "A"},
                "algorithm": "MD5",  # not in [Ed25519, RS256, ES256]
                "signature": "sig",
            }
        ]
    }
    _expect_invalid(m, "MD5 signature algorithm")


def test_bad_derived_from_relation() -> None:
    m = deepcopy(VALID_BASELINE)
    m["document"]["derived_from"] = [
        {"id": "urn:mdx:doc:src", "relation": "inspired-by"}  # not in enum
    ]
    _expect_invalid(m, "bad derived_from.relation")


def test_bad_accessibility_feature() -> None:
    m = deepcopy(VALID_BASELINE)
    m["document"]["accessibility"] = {"features": ["flying-unicorn"]}
    _expect_invalid(m, "unknown accessibility feature")


def test_bad_hazard_value() -> None:
    m = deepcopy(VALID_BASELINE)
    m["document"]["accessibility"] = {"hazards": ["spider"]}
    _expect_invalid(m, "unknown hazard")


# ---------------------------------------------------------------------------
# additionalProperties rejections
# ---------------------------------------------------------------------------

def test_unknown_root_property() -> None:
    m = deepcopy(VALID_BASELINE)
    m["unexpected_field"] = "value"
    _expect_invalid(m, "unknown root property")


def test_unknown_document_property() -> None:
    m = deepcopy(VALID_BASELINE)
    m["document"]["unexpected_field"] = "value"
    _expect_invalid(m, "unknown document property")


# ---------------------------------------------------------------------------
# locales structural rejections (only those expressible in JSON Schema;
# `default must be in available[].tag` is an invariant enforced by
# MDXManifest.validate() instead.)
# ---------------------------------------------------------------------------

def test_locales_empty_available() -> None:
    m = deepcopy(VALID_BASELINE)
    m["content"]["locales"] = {"default": "en-US", "available": []}
    _expect_invalid(m, "empty locales.available (minItems: 1)")


def test_locales_missing_required_tag() -> None:
    m = deepcopy(VALID_BASELINE)
    m["content"]["locales"] = {
        "default": "en-US",
        "available": [{"entry_point": "document.md"}],  # no tag
    }
    _expect_invalid(m, "locale missing tag")


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

TESTS = [
    test_baseline_validates,
    test_missing_mdx_version,
    test_missing_document_id,
    test_missing_document_title,
    test_missing_content_entry_point,
    test_non_semver_mdx_version,
    test_non_uuid_document_id,
    test_bad_content_hash_algorithm,
    test_bad_did_format,
    test_bad_signature_algorithm,
    test_bad_derived_from_relation,
    test_bad_accessibility_feature,
    test_bad_hazard_value,
    test_unknown_root_property,
    test_unknown_document_property,
    test_locales_empty_available,
    test_locales_missing_required_tag,
]


def main() -> int:
    if AJV is None:
        print(
            "  [SKIP] ajv-cli not found on PATH; run "
            "`npm install -g ajv-cli ajv-formats` then retry"
        )
        return 0
    passed = 0
    failed: list[str] = []
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
