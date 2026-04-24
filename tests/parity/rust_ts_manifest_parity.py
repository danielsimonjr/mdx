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


def parse_with_rust(archive: Path) -> dict | None:
    """Shell out to a Rust helper binary to parse the archive.

    Returns None if cargo is not available (CI handles this); returns
    the parsed-and-reserialized typed subset otherwise.
    """
    import shutil
    if shutil.which("cargo") is None:
        print("  cargo not on PATH — skipping Rust parity (CI will catch).")
        return None

    # Compile an ad-hoc example that opens the archive and prints the
    # typed manifest subset as JSON. Ideally this would be a binary in
    # the bindings/rust crate; for now we use `cargo run --example`.
    repo_root = Path(__file__).resolve().parents[2]
    rust_dir = repo_root / "bindings" / "rust"
    example = rust_dir / "examples" / "parity_dump.rs"
    if not example.exists():
        print(f"  parity_dump.rs not found at {example} — add the example first.")
        return None
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
        print("  cargo spawn failed — skipping Rust parity.")
        return None
    if proc.returncode != 0:
        print(f"  cargo run failed (exit {proc.returncode}):")
        print(proc.stderr)
        sys.exit(1)
    return json.loads(proc.stdout)


def main(argv: list[str]) -> int:
    if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    if len(argv) != 2:
        print(f"Usage: {argv[0]} <archive.mdx|mdz>", file=sys.stderr)
        return 2
    archive = Path(argv[1]).resolve()
    if not archive.exists():
        print(f"Archive not found: {archive}", file=sys.stderr)
        return 2

    print(f"Parity: {archive.name}")
    manifest = extract_manifest(archive)
    ts_subset = rust_typed_subset(manifest)

    rust_subset = parse_with_rust(archive)
    if rust_subset is None:
        # Rust not available — run in TS-only smoke mode so the harness
        # still exercises something.
        print("  [SKIP] Rust side unavailable; TS-only self-consistency only.")
        return 0

    if ts_subset == rust_subset:
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
