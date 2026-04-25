# Browser-extension icons — placeholder set

The PNGs in this directory are **1×1 transparent placeholders**. They
satisfy the manifest.json reference + the CI test that asserts every
referenced file exists, but they are NOT production icon artwork.

**Before submitting to AMO / Chrome Web Store:** replace each file
with a real icon at the correct dimensions:

| File | Size | Used in |
|------|------|---------|
| `icon-16.png` | 16×16 | Browser toolbar (small) |
| `icon-48.png` | 48×48 | Extension management page |
| `icon-128.png` | 128×128 | Store listing + install dialog |

**Source files:** when real icons are designed, commit the source
SVG + the export pipeline alongside, so reproducible builds (Firefox
AMO requirement) can re-derive the PNGs from source.

Tracked as Phase 2.5 follow-up in ROADMAP.
