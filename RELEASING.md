# Releasing

This monorepo uses [changesets](https://github.com/changesets/changesets) for
per-package versioning, CHANGELOG.md generation, and tagging. Per-package
versioning is intentional: the workspace contains heterogeneous artifacts
(an Electron app, a CLI, an npm web component, a Cloudflare Worker, a
TypeScript reference implementation) that ship to different consumers and
should not be lockstep-bumped.

## Workflow

1. **After a code change** that should be released, add a changeset:

   ```
   npx changeset
   ```

   Pick the affected packages, the semver bump (patch / minor / major),
   and write a one-sentence summary. The tool writes a markdown file to
   `.changeset/` which you commit alongside the code change.

2. **The changeset file is committed in the same PR as the code change.**
   It is consumed by the version step below; do not delete it manually.

3. **At release time** consume accumulated changesets:

   ```
   npx changeset version
   ```

   This bumps each affected package's `package.json` version, updates (or
   creates) per-package `CHANGELOG.md` files, deletes the consumed
   `.changeset/*.md` files, and stages the changes. Review the diff.

4. **Commit the version bump and tag:**

   ```
   git commit -m "chore(release): version packages"
   git tag <package-name>@<new-version>   # one tag per released package
   git push --follow-tags
   ```

5. **Publish to npm** (manual; only when ready, requires `npm login`):

   ```
   npx changeset publish
   ```

   `changeset publish` skips packages with `"private": true` automatically.
   It only publishes the packages that just had their version bumped.

## Packages tracked by changesets

| Package | Path | Currently `private` | In `ignore` list |
| --- | --- | --- | --- |
| `mdz-cli` | `cli/` | no | no |
| `mdx-format` | `implementations/typescript/` | no | no |
| `@mdz-format/viewer` | `packages/mdz-viewer/` | yes (temporary) | no |
| `@mdz-format/viewer-hosted` | `packages/mdz-viewer-hosted/` | yes | yes |
| `@mdz-format/editor-desktop` | `editor-desktop/` | yes | yes |

The two `ignore`-listed packages are deployed via their own pipelines
(`wrangler deploy` for the Worker, `electron-builder` for the desktop app)
and are never published to npm. `@mdz-format/viewer` is `private` until its
`dist/` build pipeline lands (see `ROADMAP.md` §2.1); it stays in the
changeset rotation so once that lands you only need to flip its `private`
flag.

## What is NOT in scope for changesets

- **`bindings/rust/`** — the Rust crate uses Cargo's release flow (e.g.
  `cargo release` / `release-plz`). Changesets only manages JS workspaces.
- **The root `package.json`** — `version: "0.0.0"` is a placeholder. The
  monorepo root is not a published artifact.
- **The browser extension at `browser-extension/`** — currently no
  `package.json` of its own; if it grows one and ships, register it then.

## Format-spec milestone tags vs package release tags

Tags like `v1.0.0-draft` and `v1.1.0-draft` are MDZ **format-spec
milestone** markers, NOT package release tags. They mark the state of
`spec/MDX_FORMAT_SPECIFICATION_v*.md` at a point in time. Keep them; they
are informational and feed into roadmap citations.

Package release tags from changesets follow the pattern
`<package-name>@<version>` (e.g. `mdz-cli@1.0.1`,
`mdx-format@1.2.0`). The two namespaces do not collide.

## Pre-release / alpha / beta lines

Changesets supports pre-release modes via:

```
npx changeset pre enter alpha   # start a pre-release line
npx changeset version            # bumps with -alpha.N suffix
npx changeset pre exit           # leave pre-release mode
```

See <https://github.com/changesets/changesets/blob/main/docs/prereleases.md>.
