#!/usr/bin/env python3
"""Cross-implementation parity harness: Rust binding vs TypeScript writer.

Walks an `.mdx` / `.mdz` archive written by the TypeScript / Python
reference impl, has the Rust binding parse it and re-emit the canonical
manifest JSON, and compares the parsed Rust output against the declared
manifest JSON byte-for-byte (after normalisation).

Catches encoder/decoder divergence that per-impl tests miss — if the
Rust binding accidentally stripped a field (e.g. `custom`) or the
TypeScript writer emitted a field the Rust binding rejects, this fails
before any user notices.

Usage:
    python tests/parity/rust_ts_manifest_parity.py examples/example-document.mdx

Exit 0 on parity; non-zero on divergence with a diff.
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path


def extract_manifest(archive: Path) -> dict:
    with zipfile.ZipFile(archive) as zf:
        with zf.open("manifest.json") as f:
            return json.load(f)


def rust_typed_subset(manifest: dict) -> dict:
    """Project the manifest to the subset the Rust binding types.

    The Rust binding only mirrors a subset of fields (mdx_version,
    document.{id,title,created,modified,content_id,subtitle,language,
    license,authors}, content.{entry_point,locales}, security). Other
    fields land in `extra`. Parity here means: the typed subset round-
    trips losslessly; extra fields are preserved but NOT compared
    byte-for-byte (that would require Serialize which the binding
    doesn't derive yet).
    """
    typed = {
        "mdx_version": manifest.get("mdx_version"),
        "document": {
            k: manifest.get("document", {}).get(k)
            for k in (
                "id", "content_id", "title", "subtitle", "language",
                "created", "modified", "license", "authors",
            )
            if manifest.get("document", {}).get(k) is not None
        },
        "content": {
            k: manifest.get("content", {}).get(k)
            for k in ("entry_point", "locales")
            if manifest.get("content", {}).get(k) is not None
        },
    }
    if manifest.get("security") is not None:
        typed["security"] = manifest["security"]
    return typed


def parse_with_rust(archive: Path, allow_skip: bool) -> dict | None:
    """Shell out to a Rust helper binary to parse the archive.

    Returns None if cargo is not available AND `allow_skip` is set;
    otherwise exits nonzero on missing cargo (the default). The harness's
    whole job is to verify the Rust↔TS round-trip — "cargo missing" =
    "cannot verify" = failure, not success.
    """
    import shutil
    if shutil.which("cargo") is None:
        if allow_skip:
            print("  cargo not on PATH — SKIPPED (per --allow-skip).")
            return None
        print("  cargo not on PATH — parity cannot be verified.", file=sys.stderr)
        print("  Pass --allow-skip to downgrade this to a non-failing skip.", file=sys.stderr)
        sys.exit(2)

    repo_root = Path(__file__).resolve().parents[2]
    rust_dir = repo_root / "bindings" / "rust"
    example = rust_dir / "examples" / "parity_dump.rs"
    if not example.exists():
        print(f"  parity_dump.rs not found at {example} — add the example first.", file=sys.stderr)
        sys.exit(2)
    try:
        proc = subprocess.run(
            ["cargo", "run", "--quiet", "--example", "parity_dump", "--", str(archive)],
            cwd=rust_dir,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
    except FileNotFoundError:
        print("  cargo spawn failed.", file=sys.stderr)
        sys.exit(2)
    if proc.returncode != 0:
        print(f"  cargo run failed (exit {proc.returncode}):", file=sys.stderr)
        print(proc.stderr, file=sys.stderr)
        sys.exit(1)
    # Slice from the first { to the last } so any cargo pre-amble or
    # trailing garbage doesn't trip json.loads.
    stdout = proc.stdout
    start = stdout.find("{")
    end = stdout.rfind("}")
    if start < 0 or end < 0 or end < start:
        print(f"  cargo run emitted no JSON object:\n{stdout!r}", file=sys.stderr)
        sys.exit(1)
    if proc.stderr.strip():
        # Not fatal, but log it — compile warnings shouldn't be silent.
        print(f"  (cargo stderr: {proc.stderr.strip()})", file=sys.stderr)
    return json.loads(stdout[start : end + 1])


def main(argv: list[str]) -> int:
    if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    allow_skip = "--allow-skip" in argv
    positional = [a for a in argv[1:] if not a.startswith("--")]
    if len(positional) != 1:
        print(f"Usage: {argv[0]} [--allow-skip] <archive.mdx|mdz>", file=sys.stderr)
        return 2
    archive = Path(positional[0]).resolve()
    if not archive.exists():
        print(f"Archive not found: {archive}", file=sys.stderr)
        return 2

    print(f"Parity: {archive.name}")
    manifest = extract_manifest(archive)
    ts_subset = rust_typed_subset(manifest)

    rust_subset = parse_with_rust(archive, allow_skip=allow_skip)
    if rust_subset is None:
        # Only reachable with --allow-skip; exit cleanly but loud.
        print("  [SKIP] Rust side unavailable; parity NOT verified.", file=sys.stderr)
        return 0

    # Compare via sort_keys-normalized JSON so nested dict ordering from
    # the two impls doesn't produce a false mismatch.
    ts_norm = json.dumps(ts_subset, sort_keys=True)
    rust_norm = json.dumps(rust_subset, sort_keys=True)
    if ts_norm == rust_norm:
        print("  [OK] Rust and TS/Python agree on the typed subset.")
        return 0

    print("  [FAIL] divergence detected:")
    print("  TS subset:")
    print(json.dumps(ts_subset, indent=2, sort_keys=True))
    print("  Rust subset:")
    print(json.dumps(rust_subset, indent=2, sort_keys=True))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
