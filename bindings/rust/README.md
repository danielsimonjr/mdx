# mdz (Rust)

Rust bindings for the MDZ (Markdown Zipped Container) format.

**Status:** 0.1.0-alpha — read-only. Writing + signature crypto verification
deferred to later phases (see Phase 3.2 / 4.1 of `../../ROADMAP.md`).

## Install

```toml
[dependencies]
mdz = { git = "https://github.com/danielsimonjr/mdx", branch = "master", package = "mdz" }
```

Once the crate is published to crates.io:

```toml
[dependencies]
mdz = "0.1"
```

## Use

```rust
use mdz::Archive;

fn main() -> Result<(), mdz::Error> {
    let bytes = std::fs::read("paper.mdz")?;
    let archive = Archive::open(&bytes)?;

    println!("Title:   {}", archive.manifest().document.title);
    println!("Version: {}", archive.manifest().mdx_version);

    // Locale resolution — pass user's preferred BCP 47 tags.
    let content = archive.document_content(&["ja-JP", "en-US"])?;
    println!("{} characters of Markdown", content.len());

    // Integrity + content_id checks (requires `verify` feature, default).
    archive.verify_integrity()?;
    archive.verify_content_id()?;

    // Signature-chain structural check — NOT cryptographic verification.
    // Returns Ok(()) if the prev_signature hashes chain correctly, which
    // catches insertion / reordering attacks but does NOT prove any entry
    // was actually signed by the claimed signer's key. Crypto verification
    // is Phase 3.2 scope.
    archive.verify_signature_chain()?;

    Ok(())
}
```

## Features

| Feature  | Default | Purpose |
|----------|---------|---------|
| `verify` | yes     | `Archive::verify_integrity` + `verify_content_id` + `verify_signature_chain`. Disable for a smaller binary if you don't need verification. |

## Security posture

Matches the TypeScript viewer's **hard** limits. The TS viewer also
defines a soft 50 MB `WARN_INFLATED_BYTES` threshold — this crate
exposes it as a `pub const` but does not take a logging dependency;
integrate with `tracing` or `log` on the caller side.

- **ZIP-bomb limits:** rejects archives >500 MB inflated or >10,000
  entries. Inflation is measured by actual bytes read (bounded reader),
  not by the ZIP central directory's declared size — so a forged
  `size=1` header cannot bypass the ceiling.
- **Path traversal:** rejects the whole archive if any entry has `..`,
  absolute path, drive letter, or NUL byte. No silent strip.
- **Hash verification:** only `sha256` and `sha512` are implemented;
  `blake3` (spec'd but deferred) returns a clear error rather than
  silently falling back.
- **No unsafe code:** `#![deny(unsafe_code)]`.

## What this crate is NOT

- **A writer.** Create archives via the `mdz` CLI (`cli/`) or the
  TypeScript SDK (`implementations/typescript/`). A Rust writer would
  duplicate validation logic; it's not worth the maintenance burden
  until someone has a concrete use case that the CLI can't serve.
- **A cryptographic verifier.** `verify_signature_chain` checks
  structural linkage (prev_signature hashes). Actual Ed25519/RS256/ES256
  signature verification against resolved DID documents is Phase 3.2
  work — the Node reference verifier (`cli/src/commands/verify.js`) has
  the same limitation.
- **A renderer.** MDZ archives render via the `<mdz-viewer>` web
  component or any Markdown pipeline. This crate hands you the
  parsed manifest + raw bytes; you bring the rendering layer.

## Build

```bash
cd bindings/rust
cargo build
cargo test
```

## Minimum supported Rust version

1.85. Pinned empirically — transitive deps under `zip 2.2` +
`serde_json` pulled in `indexmap 2.x` at CI-install time with an
edition = "2024" requirement, and edition 2024 was stabilized in
Rust 1.85. If a future `cargo update` removes that transitive pull,
MSRV could be dropped; verify before doing so.

## License

MIT. Same as the parent project.
