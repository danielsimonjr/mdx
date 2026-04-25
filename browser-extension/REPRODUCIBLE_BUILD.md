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

## Current state (Phase 4.6.8 — deterministic Node bundler)

The shipped extension is **plain JS** with no compile / minify /
bundle step. Reproducing it goes through the in-repo Node bundler
at `browser-extension/build.js`:

```bash
# From the repository root
node browser-extension/build.js --print-sha256
```

Output: `mdz-viewer-extension-<version>.zip` in the repo root,
plus the SHA-256 printed to stdout. That SHA MUST match the
SHA-256 of the AMO-uploaded artifact.

The bundler walks `manifest.json` + the five packaged dirs
(`background`, `content`, `popup`, `viewer`, `icons`), excludes
`test/` and host-specific metadata files (`.DS_Store`, `Thumbs.db`,
`desktop.ini`), sorts entries by archive path, and pins every
entry's header timestamp to 1980-01-01 (earliest legal ZIP date)
so the byte stream is stable across runs and host OSes.

CI runs the bundler twice on every push and asserts the two
SHA-256s match (`build determinism` test in
`browser-extension/test/build.test.js` plus a CI-level diff).
Non-determinism is a release blocker.

### Why a Node bundler instead of `zip -X`

The earlier recipe relied on Info-ZIP's `zip -X` to strip
host-specific attributes, but `zip -X` on Windows still emits
different bytes than on Linux because the ZIP `external_attr`
field reflects source filesystem permissions (NTFS vs. ext4).
The Node bundler sets a fixed `external_attr` (0644) and a fixed
timestamp, producing byte-identical output across all three CI
host OSes.

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
