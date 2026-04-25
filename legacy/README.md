# Legacy code (not actively maintained)

These three directories shipped before the Phase 2 production
implementations and have been preserved here for reference. None
are wired into CI, none are linked from the project README, and
none should be used as a starting point for new code.

| Directory | What it is | Replaced by |
|-----------|------------|-------------|
| `editor/` | Single-file WYSIWYG editor demo (Phase 1 era) | `editor-desktop/` Electron editor (Phase 2.3) |
| `viewer/` | Single-file HTML viewer demo | `packages/mdz-viewer/` web component (Phase 2.1) + `packages/mdz-viewer-hosted/` Cloudflare worker (Phase 2.2) |
| `chrome-extension/` | Legacy Chrome-only browser extension | `browser-extension/` MV3 cross-browser extension (Phase 2.5) |

## Why kept at all

Three reasons:

1. **Documentation cross-references** — older docs and external
   links may still point at `viewer/index.html` and similar
   paths. Moving them under `legacy/` rather than deleting
   preserves the git history without leaving stale references
   broken in unpredictable ways.
2. **Implementation reference** — when porting features from the
   single-file demos to the production code, having the original
   side-by-side is occasionally useful (the `editor/` WYSIWYG
   asset-sidebar pattern informed `editor-desktop/`'s; the
   `viewer/` outline-rendering informed the Phase 2.1 web
   component's accessibility tree).
3. **Reproducibility for archived work** — anyone reading a 2025
   blog post or talk that demoed the format probably ran one of
   these. They still work; they're just not how the project
   moves forward.

## What NOT to do

- Don't import from `legacy/` into Phase 2+ code. If you need a
  helper, copy it into the right Phase 2 module and bring its
  tests with it.
- Don't add new features here. Open a Phase 2 PR instead.
- Don't run CI against these. The top-level `.github/workflows/`
  workflow deliberately doesn't reference `legacy/`.

## Removal target

These will be deleted entirely when Phase 0.1 closes (the
`/mdx/**` → `/mdz/**` directory rename). At that point the
production paths will be the only ones in the tree and there's
no need to preserve the history (it lives in git).
