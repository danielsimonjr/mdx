# Release engineering

How the MDZ project ships: versioning, tagging, publishing, errata.

## What we release

| Artifact | Where | Versioning |
|----------|-------|------------|
| Specification | `spec/MDZ_FORMAT_SPECIFICATION_v*.md` + GitHub release | SemVer (2.0.0, 2.1.0, 3.0.0) |
| Reference TypeScript SDK | `implementations/typescript/` + npm: `@mdz-format/sdk` (TBD) | SemVer |
| `<mdz-viewer>` web component | `packages/mdz-viewer/` + npm: `@mdz-format/viewer` | SemVer |
| CLI (`mdz`) | `cli/` + npm: `mdz-cli` (TBD) | SemVer |
| Rust crate | `bindings/rust/` + crates.io: `mdz` | SemVer |
| Conformance suite | `tests/conformance/` | SemVer (tracks spec) |
| Desktop editor (Phase 2.3) | GitHub Releases + installer packages | SemVer |
| Browser extension | Chrome/Firefox/Edge stores | SemVer |
| Hosted viewer | `view.mdz-format.org` Cloudflare Worker | Rolling (no versioning visible to users) |

## Versioning rules

### Specification

- **Major** (2.0 → 3.0): breaking change to on-disk archive format or
  manifest schema that existing readers can't process.
- **Minor** (2.0 → 2.1): backward-compatible additions — new optional
  fields, new directives, new profile rules. Existing archives still
  parse; existing readers get a warning on unknown features.
- **Patch** (2.0.0 → 2.0.1): typo fixes, prose clarifications,
  normative-constraint additions that were always semantically
  required.

### Reference implementations

- Track the spec major+minor. A reference impl at v2.1.x implements
  spec v2.1.
- Patch versions (2.1.3 → 2.1.4) are bugfixes; never introduce new
  format features.
- Pre-1.0 (0.x.y) versions indicate pre-production quality. The 0.1
  prefix on current viewer / CLI versions signals that.

### Backward-compat window

- Readers MUST accept every format version from v1.1 forward as of the
  Phase 5 release, and at least the most recent major + previous
  major going forward.
- Writers SHOULD default to the current spec version but allow opt-in
  emitting older versions for compatibility with old readers.
- The MDX → MDZ rename sunset is **2027-01-01** per
  `CHANGELOG.md` — readers stop accepting `.mdx` / `application/vnd.mdx-container+zip`
  after that. Writers stopped producing them on 2026-04-24.

## Release workflow

### Spec release

1. All merged RFCs targeting this version are implemented in
   reference implementations.
2. Conformance suite fixtures for new features added; CI green.
3. Spec document finalized: proof-read, cross-referenced, dated.
4. Tag: `spec-v2.1.0`.
5. GitHub Release with:
   - Link to the frozen spec file (commit-pinned URL).
   - Release notes summarizing RFCs included.
   - Migration guide from previous version if breaking.
6. Updates `mdz-format.org/spec/latest/` to redirect to new version.
   Previous versions remain accessible at
   `mdz-format.org/spec/v2.0/`, etc.

### SDK / viewer / CLI release

1. Version bumped in `package.json`, `Cargo.toml`, etc.
2. `CHANGELOG.md` updated.
3. Tag matches: `viewer-v0.2.0`, `cli-v0.3.0`, `rust-v0.1.0`.
4. CI publishes to registries:
   - npm: `npm publish --access=public` from the tag.
   - crates.io: `cargo publish`.
   - Chrome/Firefox/Edge stores: automated via GitHub Actions (Phase 4+).
5. GitHub Release with signed tarball attachments (reproducible build
   preferred for Firefox AMO).

### Hotfix release

For security issues:

1. Fix on a `hotfix/CVE-YYYY-NNNN` branch.
2. Skip the full RFC process — security fixes land immediately.
3. Coordinated disclosure: 90-day window from private report to public
   release, or 30 days if the issue is already being actively
   exploited.
4. Backport to all supported versions.
5. Security advisory published via GitHub Security Advisories + the CG
   mailing list.

## Release cadence

- **Spec:** quarterly at most; prefer 6-month minor-version cycles.
- **Reference implementations:** on each RFC implementation — could be
  monthly during active development, longer during maintenance.
- **CLI / SDK patches:** on each bugfix batch.
- **Hosted viewer:** continuous deploy on every master commit that
  passes CI (with rollback capability).

## Errata

Bugs in published specs are handled via the errata process:

1. Open an issue tagged `errata` with a test case demonstrating the
   problem.
2. Editor confirms; publishes a short errata note at
   `spec/errata/<version>.md` and pins it atop the affected spec file.
3. If the errata changes MUST behavior, it's treated as a new patch
   version of the spec (v2.0.1).

Errata are NEVER silently applied — the change is always visible and
dated.

## Deprecation

When a feature is deprecated:

1. RFC marks it deprecated, with a sunset version + date.
2. Reference implementations emit a deprecation warning on use.
3. Sunset version REMOVES the feature with a migration guide.
4. Minimum deprecation window: 12 months OR one major version,
   whichever is longer.

## Supply chain security

- All published packages are signed:
  - npm: `npm provenance` when available.
  - crates.io: signed with GPG per crates.io policy.
  - GitHub Releases: tarballs signed with the release manager's key.
- Reproducible builds for the Firefox extension (AMO requires).
- Lock files committed to the repo; dependabot monitors for CVEs.
- SBOM (Software Bill of Materials) published with each major release.

## Release manager

Until the CG is chartered, the release manager is the founder /
primary editor. Post-charter, the role rotates quarterly among CG
participants who volunteer.

## Emergency process

If the release manager is unavailable for > 2 weeks during an active
security incident:

1. Any CG participant with commit access may cut a hotfix release.
2. The hotfix must be signed.
3. Post-hoc review within 2 weeks of the release manager returning.

Contact info for the emergency process lives in a private channel
(not in this public file) to avoid being a target.

## See also

- `CHARTER.md` — governance structure.
- `RFC_PROCESS.md` — how changes get proposed and accepted.
- `TRADEMARK.md` — trademark usage.
- `../security/THREAT_MODEL.md` — security considerations.
