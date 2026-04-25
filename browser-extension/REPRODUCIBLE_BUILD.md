# Reproducible build instructions — MDZ Viewer browser extension

**Audience:** Mozilla AMO reviewers (Firefox add-on store) and
anyone who wants to verify that the published `.xpi` is byte-stable
against this repository.

Mozilla AMO requires reproducible-build instructions for any
extension that contains minified or transpiled code. This extension
ships only hand-written ES modules with no build step, but we publish
these instructions anyway because Phase 2.5 will eventually bundle
the `<mdz-viewer>` web component (which needs a tsc compile pass).

---

## Current state (Phase 2.5 — pre-bundle)

The shipped extension is **plain JS** with no compile / minify /
bundle step. Reproducing it is a `zip` invocation:

```bash
# From the repository root
cd browser-extension
zip -r -X ../mdz-viewer-extension-0.1.0.zip \
    manifest.json \
    background/ \
    content/ \
    popup/ \
    viewer/ \
    icons/ \
    -x "test/*"
```

The flags above:

- `-r` — recurse into directories.
- `-X` — strip extra file attributes (filesystem-specific bits like
  Windows ACLs, macOS extended attributes) that would make the
  archive non-deterministic across host OSes.
- `-x "test/*"` — exclude the test directory from the published
  package.

Output: `mdz-viewer-extension-0.1.0.zip`. SHA-256 of this file MUST
match the SHA-256 of the AMO-uploaded artifact.

## Build environment

For the current pre-bundle state:

- `zip` command (Info-ZIP 3.0+ on Linux/macOS; Windows users:
  install via `choco install zip` or use 7-Zip with deterministic
  flags).
- That's it. No Node, no tsc, no bundler.

When the bundle pass lands (Phase 2.1 viewer integration into the
extension):

- Node.js 20.x LTS (pin the exact `.x` version in
  `package.json#engines`).
- A committed `package-lock.json` so `npm ci` resolves to identical
  versions.
- A committed `.nvmrc` for the Node version.

## CI verification

`.github/workflows/ci.yml` runs `node --test
browser-extension/test/manifest.test.js` on every push, which
asserts the manifest's structural invariants and that every file
referenced by manifest.json exists. **The test does NOT yet build
the actual `.zip` and verify its hash** — that gate lands when the
bundler is wired (Phase 2.5 follow-up).

## Submitting to AMO

1. Run the `zip` command above on a clean checkout.
2. Compute SHA-256 of the resulting `.zip`.
3. Upload via the AMO web interface or `web-ext sign`.
4. In the AMO submission form's "Source code" field, paste a link
   to this file's HEAD revision plus the matching SHA-256.

## Submitting to Chrome Web Store / Edge

Chrome and Edge stores do not require reproducible-build proof, but
the same `.zip` works for both. Re-sign / re-upload as needed.

## Submitting to Brave / Arc

Brave Shop accepts the Chrome Web Store ID directly — no separate
upload. Arc currently relies on Chrome Web Store install flows.

---

## Known limitations of the current build

- **No SRI / CSP hash** for the bundled web component (no bundle
  yet).
- **Icons are 1×1 transparent PNG placeholders.** Replace with real
  artwork before AMO submission. See `icons/README.md`.
- **No web-ext lint pass in CI yet.** Adding `npm install -g
  web-ext && web-ext lint --source-dir browser-extension` is a
  Phase 2.5 follow-up.
- **Cross-browser smoke tests are unimplemented.** Real browser
  driving (puppeteer / playwright) requires headed chrome /
  firefox containers in CI; tracked as Phase 2.5 follow-up.
