#!/usr/bin/env python3
"""Generates `examples/v2/comprehensive.mdx` — a v2.0 document that
exercises every one of the ten new sections in
`spec/MDX_FORMAT_SPECIFICATION_v2.0.md`.

Run:
    python implementations/python/create_v20_example.py

Output:
    examples/v2/comprehensive.mdx

Design: this is the *reference* v2.0 example. Every other per-feature
example under `examples/v2/` isolates a single feature; this one shows
them all interacting so we can round-trip parse and validate the
full surface in one go.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_hash(data: bytes) -> str:
    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def new_uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Asset payloads (tiny inline fixtures)
# ---------------------------------------------------------------------------

# Tiny 1x1 PNG (base64-free; raw bytes)
PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000050001e0fa8e6c0000000049454e44ae426082"
)

# Tiny CSV
CSV_SAMPLE = b"year,value\n2024,10\n2025,15\n2026,22\n"

# Cached output image for the cell (reuse the PNG)
CELL_OUTPUT_PNG = PNG_1x1


# ---------------------------------------------------------------------------
# Markdown content (per locale)
# ---------------------------------------------------------------------------

MD_DEFAULT_EN = """\
# Comprehensive v2.0 Demo

{:.center}
This document exercises every major v2.0 feature. See the manifest for
the machine-readable metadata backing each section.

## Section 1 — Transclusion

::include[path="legal-boilerplate.md"]

## Section 2 — Computational Cell

::cell{language="python" kernel="python3" execution_count=1}
```python
import numpy as np
x = np.linspace(0, 2*np.pi, 100)
y = np.sin(x)
print(f"mean={y.mean():.6f}")
```

::output{type="text"}
```
mean=-0.000000
```

::output{type="image" mime="image/png" src="assets/images/cell-fig.png"}

## Section 3 — Responsive Figure

![Sine wave plot](assets/images/cell-fig.png)

The image above has multiple variants declared in the manifest
(`assets.images[].variants[]`): AVIF + WebP alternative formats, and
a high-density `@2x` variant.

## Section 4 — Data with Schema

::data[Measurements]{src="assets/data/measurements.csv" type="table" has-header}

## Section 5 — Accessibility Notes

See `document.accessibility` for: WCAG-2.2-AA compliance claim,
reading level, feature list, and content warnings (none declared).

## Section 6 — Derived From

This document is forked from an upstream reference. See
`document.derived_from[]` in the manifest for the full provenance chain.
"""

MD_LEGAL_BOILERPLATE = """\
{:.center}
*This document is released under CC-BY-4.0. All embedded assets carry
the same license unless otherwise noted.*
"""

MD_ES = """\
# Demostración Integral v2.0

Este documento ejercita todas las funciones principales de v2.0. Consulte
el manifiesto para los metadatos legibles por máquina que respaldan cada
sección.

## Secciones
- Transclusión
- Celda Computacional
- Figura Responsive
- Datos con Esquema
- Accesibilidad
- Derivación
"""

MD_JA = """\
# v2.0 総合デモ

この文書は v2.0 のすべての主要機能を実証します。各セクションを裏付ける
機械可読メタデータについてはマニフェストを参照してください。

## セクション
- トランスクルージョン
- 計算セル
- レスポンシブ図
- スキーマ付きデータ
- アクセシビリティ
- 派生元
"""

# A shorter variant for "executive summary" audience
MD_VARIANT_SHORT = """\
# Demo v2.0 — Executive Summary

This archive demonstrates MDX v2.0's ten new capabilities in a single
document. For the full walkthrough, switch to the default variant.
"""


# ---------------------------------------------------------------------------
# Manifest assembly
# ---------------------------------------------------------------------------


def build_manifest(now: str, doc_id: str) -> dict:
    png_hash = sha256_hash(PNG_1x1)
    csv_hash = sha256_hash(CSV_SAMPLE)
    cell_hash = sha256_hash(CELL_OUTPUT_PNG)

    return {
        "$schema": "https://mdx-format.org/schemas/manifest-v2.schema.json",
        "mdx_version": "2.0.0",

        "document": {
            "id": doc_id,
            "title": "Comprehensive v2.0 Demo",
            "subtitle": "One archive exercising all ten new v2.0 sections",
            "description": (
                "Reference example that exercises every new section of the MDX v2.0 "
                "specification in a single archive — i18n, content-addressing, cells, "
                "transclusion, profile, accessibility, provenance, multi-sig, variants."
            ),
            "authors": [
                {"name": "MDX Format Authors", "url": "https://mdx-format.org/"}
            ],
            "created": now,
            "modified": now,
            "version": "1.0.0",
            "language": "en-US",
            "license": {"type": "CC-BY-4.0", "url": "https://creativecommons.org/licenses/by/4.0/"},
            "keywords": ["mdx", "v2.0", "reference", "demo"],
            "category": "specification-example",

            # §13
            "profile": "https://mdx-format.org/profiles/api-reference/v1",

            # §15
            "derived_from": [
                {
                    "id": "urn:mdx:doc:upstream-reference",
                    "version": "1.1.0",
                    "relation": "derivative-work",
                    "notes": "Built on the v1.1 example-document.mdx as a structural base.",
                }
            ],

            # §14
            "accessibility": {
                "summary": (
                    "Every image has alt text and a long description; the data asset "
                    "includes a sonification; the computational cell has a cached "
                    "text + image output so re-execution is optional."
                ),
                "reading_level": "grade-11",
                "content_warnings": [],
                "features": [
                    "captions",
                    "long-description",
                    "structural-navigation",
                    "sonification",
                ],
                "hazards": ["none"],
                "api_compliance": ["WCAG-2.2-AA"],
            },
        },

        "content": {
            "entry_point": "document.md",
            "encoding": "UTF-8",
            "markdown_variant": "CommonMark",
            "markdown_version": "0.31",
            "extensions": [
                "tables",
                "footnotes",
                "task-lists",
                "math",
                "attributes",
                "alignment",
                "include",
                "cell",
                "locales",
                "variants",
            ],

            # §8
            "locales": {
                "default": "en-US",
                "available": [
                    {"tag": "en-US", "entry_point": "document.md", "title": "Comprehensive v2.0 Demo"},
                    {"tag": "es-ES", "entry_point": "locales/es/document.md", "title": "Demostración Integral v2.0"},
                    {"tag": "ja-JP", "entry_point": "locales/ja/document.md", "title": "v2.0 総合デモ"},
                ],
                "fallback": ["en-US"],
            },

            # §17
            "variants": [
                {
                    "id": "default",
                    "entry_point": "document.md",
                    "audience": "general",
                },
                {
                    "id": "short",
                    "entry_point": "variants/short/document.md",
                    "audience": "executive-summary",
                    "title": "Demo v2.0 — Executive Summary",
                },
            ],

            # §12
            "includes": [
                {
                    "id": "legal-boilerplate",
                    "target": "legal-boilerplate.md",
                    "trusted": True,
                }
            ],
        },

        "assets": {
            "images": [
                {
                    "path": "assets/images/cell-fig.png",
                    "mime_type": "image/png",
                    "size_bytes": len(CELL_OUTPUT_PNG),
                    "content_hash": cell_hash,
                    "width": 1,
                    "height": 1,
                    "alt_text": "Sine wave plot (placeholder; 1x1 pixel for demo)",
                    # §14.3
                    "accessibility": {
                        "long_description": (
                            "A sine wave plot generated by numpy, showing one full period "
                            "of sin(x) from 0 to 2π across 100 sample points. The mean "
                            "is approximately zero as expected by symmetry."
                        )
                    },
                    # §17.2
                    "variants": [
                        {"path": "assets/images/cell-fig.avif", "mime_type": "image/avif", "formats": ["avif"]},
                        {"path": "assets/images/cell-fig.webp", "mime_type": "image/webp", "formats": ["webp"]},
                        {"path": "assets/images/cell-fig@2x.png", "density": "2x", "width": 2, "height": 2},
                    ],
                }
            ],
            "data": [
                {
                    "path": "assets/data/measurements.csv",
                    "mime_type": "text/csv",
                    "size_bytes": len(CSV_SAMPLE),
                    "content_hash": csv_hash,
                    "rows": 3,
                    "columns": 2,
                    "has_header": True,
                    "encoding": "UTF-8",
                    "accessibility": {
                        "sonification": "assets/audio/measurements.sonification.mp3"
                    },
                }
            ],
        },

        # §11
        "interactivity": {
            "kernels": [
                {
                    "id": "python3",
                    "language": "python",
                    "version": "3.11",
                    "requirements": ["numpy>=1.25"],
                }
            ],
            "fallback_behavior": "show-cached-output",
        },

        "history": {
            "enabled": True,
            "versions_file": "history/versions.json",
            "graph_file": "history/graph.json",
        },

        # §16
        "security": {
            "integrity": {"algorithm": "sha256"},
            "signatures": [
                {
                    "role": "author",
                    "signer": {
                        "name": "MDX Format Authors",
                        "did": "did:web:mdx-format.org",
                    },
                    "algorithm": "Ed25519",
                    "scope": "manifest-only",
                    "canonicalization": "jcs",
                    "timestamp": now,
                    "signature": "ZXhhbXBsZS1zaWduYXR1cmUtcGxhY2Vob2xkZXItbm90LXZlcmlmaWFibGU=",
                }
            ],
            "permissions": {
                "allow_external_links": True,
                "allow_external_images": False,
                "allow_external_includes": False,
                "allow_scripts": False,
                "allow_kernels": False,
            },
        },
    }


# ---------------------------------------------------------------------------
# Archive assembly — respects §10 normative ordering
# ---------------------------------------------------------------------------

ORDERED_ENTRIES: list[tuple[str, bytes]] = []  # populated in main()


def main() -> None:
    now = iso_now()
    doc_id = new_uuid()
    manifest = build_manifest(now, doc_id)

    # Build versions/graph for §15 demo
    versions = {
        "schema_version": "1.0.0",
        "current_version": "1.0.0",
        "versions": [
            {
                "version": "1.0.0",
                "timestamp": now,
                "author": {"name": "MDX Format Authors"},
                "message": "Initial v2.0 reference example",
                "snapshot": {"type": "full", "path": "history/snapshots/v1.0.0.md"},
                "parent_versions": [],  # v2.0 multi-parent form, empty for initial
            }
        ],
    }
    graph = {
        "schema_version": "1.0.0",
        "nodes": [{"id": "v1.0.0", "version": "1.0.0", "timestamp": now}],
        "edges": [],
    }

    # Entries in v2.0 normative order (§10.2):
    #   manifest → entry points (all locales + variants) → styles → data → media by size
    manifest_bytes = json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8")

    ordered: list[tuple[str, bytes]] = [
        ("manifest.json", manifest_bytes),
        # Primary + all locale + variant entry points
        ("document.md", MD_DEFAULT_EN.encode("utf-8")),
        ("locales/es/document.md", MD_ES.encode("utf-8")),
        ("locales/ja/document.md", MD_JA.encode("utf-8")),
        ("variants/short/document.md", MD_VARIANT_SHORT.encode("utf-8")),
        # Transclusion target
        ("legal-boilerplate.md", MD_LEGAL_BOILERPLATE.encode("utf-8")),
        # Text-like data next
        ("assets/data/measurements.csv", CSV_SAMPLE),
        # Media in increasing size order (only one image here)
        ("assets/images/cell-fig.png", CELL_OUTPUT_PNG),
        # Content-addressed alias (§9.2) — byte-identical to the path above
        (f"assets/by-hash/sha256/{hashlib.sha256(CELL_OUTPUT_PNG).hexdigest()}.png", CELL_OUTPUT_PNG),
        # History
        ("history/versions.json", json.dumps(versions, indent=2).encode("utf-8")),
        ("history/graph.json", json.dumps(graph, indent=2).encode("utf-8")),
        ("history/snapshots/v1.0.0.md", MD_DEFAULT_EN.encode("utf-8")),
    ]

    out = Path(__file__).resolve().parents[2] / "examples" / "v2" / "comprehensive.mdx"
    out.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as mdx:
        for path, data in ordered:
            info = zipfile.ZipInfo(path)
            info.compress_type = zipfile.ZIP_DEFLATED
            mdx.writestr(info, data)

    # Sanity-print structure
    print(f"Wrote: {out}")
    print(f"Size:  {out.stat().st_size} bytes")
    with zipfile.ZipFile(out, "r") as mdx:
        print(f"Entries ({len(mdx.namelist())}):")
        for name in mdx.namelist():
            info = mdx.getinfo(name)
            print(f"  {info.file_size:>8}  {name}")


if __name__ == "__main__":
    main()
