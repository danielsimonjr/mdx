//! # mdz — Rust bindings for the MDZ file format
//!
//! MDZ (Markdown Zipped Container) is a single-file format for executable
//! scientific papers. This crate provides a **read-side** implementation:
//! parse an `.mdz` or legacy `.mdx` archive, validate the manifest, extract
//! assets, and (with the `verify` feature) check content hashes and
//! signature-chain structure.
//!
//! ## Scope of the 0.1.0-alpha
//!
//! Ships:
//! - [`Archive::open`] — load a `.mdz` / `.mdx` archive from bytes.
//! - [`Manifest`] — structural representation of `manifest.json` fields the
//!   Rust binding cares about (writer ergonomics are not on the roadmap).
//! - [`Archive::entry`] — read any archive-relative path as bytes.
//! - [`Archive::document_content`] — primary Markdown content for the active
//!   locale.
//! - [`Archive::verify_integrity`] — check `security.integrity.manifest_checksum`.
//! - [`Archive::verify_content_id`] — check `document.content_id` against the
//!   entry-point bytes.
//!
//! Does NOT ship:
//! - Actual Ed25519/RS256/ES256 signature verification (Phase 3.2 work,
//!   same caveat as the Node reference verifier).
//! - Writer API (the `mdz` CLI and `@mdz-format/viewer` remain the
//!   canonical authoring paths; Rust is read-first).
//! - Pyodide/WebAssembly cell execution (outside the format's scope).
//!
//! ## Why Rust?
//!
//! Target consumers:
//! 1. `tauri`-based desktop editors (MDZ as first-class file type).
//! 2. WASM viewer builds for embedding in non-JS hosts.
//! 3. Academic publishing backends written in Rust (e.g., Zenodo's
//!    ingest pipeline).
//!
//! The API is deliberately read-only and narrow; adding writer support
//! would double the surface area and duplicate logic already in the
//! TypeScript and Python references.
//!
//! ## Example
//!
//! ```no_run
//! use mdz::Archive;
//!
//! # fn main() -> Result<(), mdz::Error> {
//! let bytes = std::fs::read("paper.mdz")?;
//! let archive = Archive::open(&bytes)?;
//!
//! println!("Title:  {}", archive.manifest().document.title);
//! println!("Format: {} ({} entries)",
//!     archive.manifest().mdx_version,
//!     archive.entry_count());
//!
//! let markdown = archive.document_content(&[])?;
//! println!("{} chars of markdown", markdown.len());
//! # Ok(())
//! # }
//! ```

#![warn(missing_docs)]
#![deny(unsafe_code)]

use std::io::Cursor;

use serde::Deserialize;
use sha2::Digest;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Error type for all MDZ archive operations.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// The archive could not be parsed as a ZIP file, or a required entry
    /// is missing.
    #[error("archive: {0}")]
    Archive(String),

    /// `manifest.json` did not conform to the expected shape.
    #[error("manifest: {0}")]
    Manifest(String),

    /// A declared hash (content_id, manifest_checksum) did not match the
    /// actual file contents.
    #[error("integrity: {0}")]
    Integrity(String),

    /// An archive entry had an unsafe path (`..`, absolute, drive letter,
    /// NUL byte). The whole archive is rejected, not silently stripped.
    #[error("path traversal attempt: {0}")]
    UnsafePath(String),

    /// IO error (bubbling up from `std::io`).
    #[error(transparent)]
    Io(#[from] std::io::Error),

    /// JSON parse error (from `manifest.json` or `references.json`).
    #[error(transparent)]
    Json(#[from] serde_json::Error),

    /// ZIP decode error (from the `zip` crate).
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
}

// ---------------------------------------------------------------------------
// Manifest types (a deliberate subset of the full schema)
// ---------------------------------------------------------------------------

/// Top-level manifest structure. Mirrors the JSON in `manifest.json`.
///
/// Only the fields this crate actually consumes are typed; the rest are
/// preserved in [`Manifest::extra`] for callers that need deeper access.
#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    /// Spec version the archive declares (`"1.1.0"`, `"2.0.0"`, etc.).
    /// Field name is `mdx_version` on-disk for backward compat with every
    /// archive ever written; readers MUST accept both naming conventions.
    pub mdx_version: String,

    /// Document-level metadata.
    pub document: DocumentInfo,

    /// Content configuration (entry point, locales, variants).
    pub content: ContentConfig,

    /// Optional security block.
    pub security: Option<SecurityConfig>,

    /// Fields outside this crate's typed subset — preserved so callers can
    /// drill into e.g. `assets` or `interactivity.kernels` without the
    /// manifest types here needing a full spec mirror.
    #[serde(flatten)]
    pub extra: std::collections::BTreeMap<String, serde_json::Value>,
}

/// Document metadata (title, authors, license, etc.).
#[derive(Debug, Clone, Deserialize)]
pub struct DocumentInfo {
    /// Unique document identifier (UUID v4).
    pub id: String,
    /// Content-addressed hash of the entry-point bytes (`<algo>:<hex>`).
    #[serde(default)]
    pub content_id: Option<String>,
    /// Document title.
    pub title: String,
    /// Optional subtitle.
    #[serde(default)]
    pub subtitle: Option<String>,
    /// Primary language (BCP 47).
    #[serde(default)]
    pub language: Option<String>,
    /// ISO 8601 creation timestamp.
    pub created: String,
    /// ISO 8601 modification timestamp.
    pub modified: String,
    /// Declared license (SPDX identifier or `{type, url}` object).
    #[serde(default)]
    pub license: Option<serde_json::Value>,
    /// Declared authors.
    #[serde(default)]
    pub authors: Vec<Author>,
}

/// Document author / signer identity.
#[derive(Debug, Clone, Deserialize)]
pub struct Author {
    /// Full name.
    pub name: String,
    /// Optional email.
    #[serde(default)]
    pub email: Option<String>,
    /// Optional URL.
    #[serde(default)]
    pub url: Option<String>,
    /// Optional W3C DID (v2.0 §16 — `did:web:...`).
    #[serde(default)]
    pub did: Option<String>,
    /// Optional role string.
    #[serde(default)]
    pub role: Option<String>,
    /// Optional organization / affiliation.
    #[serde(default)]
    pub organization: Option<String>,
}

/// Content configuration — entry point, locales, variants.
#[derive(Debug, Clone, Deserialize)]
pub struct ContentConfig {
    /// Archive-relative path to the primary Markdown file.
    pub entry_point: String,
    /// Optional multi-locale bundle.
    #[serde(default)]
    pub locales: Option<ContentLocales>,
}

/// Multi-locale content bundle (v2.0 §8).
#[derive(Debug, Clone, Deserialize)]
pub struct ContentLocales {
    /// BCP 47 tag of the default locale.
    pub default: String,
    /// One entry per supported locale.
    pub available: Vec<LocaleAvailable>,
    /// Ordered fallback chain.
    #[serde(default)]
    pub fallback: Vec<String>,
}

/// A single locale entry.
#[derive(Debug, Clone, Deserialize)]
pub struct LocaleAvailable {
    /// BCP 47 tag.
    pub tag: String,
    /// Path to this locale's primary markdown file.
    pub entry_point: String,
    /// Localized title.
    #[serde(default)]
    pub title: Option<String>,
}

/// Security block — integrity + signatures.
#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    /// Integrity configuration.
    #[serde(default)]
    pub integrity: Option<IntegrityConfig>,
    /// Multi-signature chain (v2.0 §16).
    #[serde(default)]
    pub signatures: Vec<SignatureEntry>,
}

/// Integrity hash over the manifest itself.
#[derive(Debug, Clone, Deserialize)]
pub struct IntegrityConfig {
    /// Algorithm name (sha256, sha512, blake3).
    pub algorithm: String,
    /// Hash of the manifest bytes in `<algo>:<hex>` form.
    #[serde(default)]
    pub manifest_checksum: Option<String>,
}

/// A single signature-chain entry.
#[derive(Debug, Clone, Deserialize)]
pub struct SignatureEntry {
    /// Role of this signer (author, reviewer, editor, publisher, notary, or custom).
    pub role: String,
    /// Signer identity (name + optional DID).
    pub signer: SignerIdentity,
    /// Signature algorithm (Ed25519, RS256, ES256).
    pub algorithm: String,
    /// Base64 signature bytes.
    pub signature: String,
    /// Hash of the previous chain entry's signature (required on all but the first).
    #[serde(default)]
    pub prev_signature: Option<String>,
}

/// Identity of a signer.
#[derive(Debug, Clone, Deserialize)]
pub struct SignerIdentity {
    /// Display name.
    pub name: String,
    /// Optional DID (`did:web:...`, `did:key:...`).
    #[serde(default)]
    pub did: Option<String>,
}

// ---------------------------------------------------------------------------
// Archive — the main public type
// ---------------------------------------------------------------------------

/// Loaded MDZ archive. Constructed via [`Archive::open`].
///
/// Holds the inflated entry map + parsed manifest in memory. For archives
/// larger than ~500 MB inflated, this will exhaust memory on low-end
/// devices; streaming variants are Phase 4.4 work.
pub struct Archive {
    manifest: Manifest,
    manifest_raw: Vec<u8>,
    entries: std::collections::BTreeMap<String, Vec<u8>>,
}

/// Conservative inflation ceiling — matches the TypeScript viewer's
/// MAX_TOTAL_INFLATED_BYTES. Archives larger than this are rejected to
/// prevent ZIP-bomb DoS in consumers that don't bound memory themselves.
pub const MAX_TOTAL_INFLATED_BYTES: u64 = 500 * 1024 * 1024; // 500 MB

/// Max entries in an archive — prevents the "many tiny files" ZIP-bomb variant.
pub const MAX_ENTRY_COUNT: usize = 10_000;

impl Archive {
    /// Parse an MDZ archive from a byte buffer.
    ///
    /// Accepts both `.mdz` (current) and `.mdx` (legacy, readable through
    /// 2027-01-01) archives — the format is byte-identical; only the
    /// extension and MIME type differ.
    ///
    /// Fails if:
    /// - The buffer is not a valid ZIP archive.
    /// - `manifest.json` is missing, unparseable, or missing required fields.
    /// - Any entry path contains `..`, is absolute, uses a drive letter, or
    ///   contains a NUL byte (rejects the whole archive rather than silently
    ///   strip — authors rarely intend malicious paths, and silent strip hides
    ///   the problem).
    /// - The archive inflates to more than [`MAX_TOTAL_INFLATED_BYTES`] or
    ///   more than [`MAX_ENTRY_COUNT`] entries.
    pub fn open(bytes: &[u8]) -> Result<Self, Error> {
        let mut zip = zip::ZipArchive::new(Cursor::new(bytes))?;

        if zip.len() > MAX_ENTRY_COUNT {
            return Err(Error::Archive(format!(
                "archive has {} entries, exceeds max {}",
                zip.len(),
                MAX_ENTRY_COUNT
            )));
        }

        let mut entries = std::collections::BTreeMap::new();
        let mut total_bytes: u64 = 0;

        for i in 0..zip.len() {
            let mut file = zip.by_index(i)?;
            // Zip entries can be directories — skip those.
            if file.is_dir() {
                continue;
            }
            let raw_name = file.name().to_string();
            let clean = sanitize_archive_path(&raw_name)
                .ok_or_else(|| Error::UnsafePath(raw_name.clone()))?;

            total_bytes = total_bytes.saturating_add(file.size());
            if total_bytes > MAX_TOTAL_INFLATED_BYTES {
                return Err(Error::Archive(format!(
                    "archive inflates to {} bytes, exceeds max {}",
                    total_bytes, MAX_TOTAL_INFLATED_BYTES
                )));
            }

            let mut buf = Vec::with_capacity(file.size() as usize);
            std::io::copy(&mut file, &mut buf)?;
            entries.insert(clean, buf);
        }

        // Manifest must be present.
        let manifest_raw = entries
            .get("manifest.json")
            .ok_or_else(|| Error::Archive("missing manifest.json".into()))?
            .clone();
        let manifest: Manifest = serde_json::from_slice(&manifest_raw)
            .map_err(|e| Error::Manifest(format!("manifest.json parse error: {}", e)))?;

        Ok(Archive {
            manifest,
            manifest_raw,
            entries,
        })
    }

    /// Access the parsed manifest.
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }

    /// Raw bytes of `manifest.json` (for re-hashing during integrity checks).
    pub fn manifest_bytes(&self) -> &[u8] {
        &self.manifest_raw
    }

    /// Number of entries in the archive (excluding directories).
    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }

    /// Iterate archive entry paths in lexicographic order.
    pub fn entry_paths(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(|s| s.as_str())
    }

    /// Read an archive entry by path. Returns `None` for missing entries.
    pub fn entry(&self, path: &str) -> Option<&[u8]> {
        self.entries.get(path).map(|v| v.as_slice())
    }

    /// Return the primary Markdown content, resolving locales against a
    /// preference list (BCP 47 tags, most-preferred first).
    ///
    /// Fallback chain:
    /// 1. First preferred tag that matches `content.locales.available[].tag`.
    /// 2. First tag in `content.locales.fallback`.
    /// 3. `content.locales.default`.
    /// 4. Top-level `content.entry_point`.
    pub fn document_content(&self, preferred: &[&str]) -> Result<String, Error> {
        let entry_point = self.resolve_entry_point(preferred);
        let bytes = self.entries.get(&entry_point).ok_or_else(|| {
            Error::Archive(format!(
                "entry_point '{}' not present in archive",
                entry_point
            ))
        })?;
        String::from_utf8(bytes.clone())
            .map_err(|e| Error::Archive(format!("entry_point is not valid UTF-8: {}", e)))
    }

    fn resolve_entry_point(&self, preferred: &[&str]) -> String {
        if let Some(locales) = &self.manifest.content.locales {
            for pref in preferred {
                if let Some(entry) = locales.available.iter().find(|a| a.tag == *pref) {
                    return entry.entry_point.clone();
                }
            }
            for fb in &locales.fallback {
                if let Some(entry) = locales.available.iter().find(|a| &a.tag == fb) {
                    return entry.entry_point.clone();
                }
            }
            if let Some(entry) = locales
                .available
                .iter()
                .find(|a| a.tag == locales.default)
            {
                return entry.entry_point.clone();
            }
        }
        self.manifest.content.entry_point.clone()
    }

    /// Verify `security.integrity.manifest_checksum` against the SHA-256 of
    /// the manifest bytes. Returns `Ok(())` if verified, a descriptive
    /// [`Error::Integrity`] otherwise, or `Ok(())` with no-op if no
    /// checksum is declared.
    ///
    /// Available only with the `verify` feature (default).
    #[cfg(feature = "verify")]
    pub fn verify_integrity(&self) -> Result<(), Error> {
        let security = match &self.manifest.security {
            Some(s) => s,
            None => return Ok(()),
        };
        let integrity = match &security.integrity {
            Some(i) => i,
            None => return Ok(()),
        };
        let declared = match &integrity.manifest_checksum {
            Some(d) => d,
            None => return Ok(()),
        };
        let (algo, expected) = parse_hash(declared)?;
        let actual = hash_bytes(&algo, &self.manifest_raw)?;
        if actual == expected {
            Ok(())
        } else {
            Err(Error::Integrity(format!(
                "manifest_checksum mismatch: declared {}, computed {}",
                &expected[..expected.len().min(16)],
                &actual[..actual.len().min(16)]
            )))
        }
    }

    /// Verify `document.content_id` against the entry-point bytes.
    #[cfg(feature = "verify")]
    pub fn verify_content_id(&self) -> Result<(), Error> {
        let declared = match &self.manifest.document.content_id {
            Some(d) => d,
            None => return Ok(()),
        };
        let (algo, expected) = parse_hash(declared)?;
        let entry_point = &self.manifest.content.entry_point;
        let bytes = self.entries.get(entry_point).ok_or_else(|| {
            Error::Integrity(format!(
                "content_id cannot be verified — entry_point '{}' missing",
                entry_point
            ))
        })?;
        let actual = hash_bytes(&algo, bytes)?;
        if actual == expected {
            Ok(())
        } else {
            Err(Error::Integrity(format!(
                "content_id mismatch: declared {}, computed {}",
                &expected[..expected.len().min(16)],
                &actual[..actual.len().min(16)]
            )))
        }
    }

    /// Check the structural integrity of the signature chain.
    ///
    /// Asserts that for every entry after the first, `prev_signature` equals
    /// `sha256(bytes(prev.signature))`. Does NOT cryptographically verify
    /// signature bytes — that requires DID resolution + crypto primitives
    /// and is Phase 3.2 work (same caveat as the Node reference verifier).
    #[cfg(feature = "verify")]
    pub fn verify_signature_chain(&self) -> Result<(), Error> {
        let security = match &self.manifest.security {
            Some(s) => s,
            None => return Ok(()),
        };
        for (i, entry) in security.signatures.iter().enumerate().skip(1) {
            let prev = &security.signatures[i - 1];
            let expected_prev_hash = format!("sha256:{}", sha256_hex(prev.signature.as_bytes()));
            match &entry.prev_signature {
                Some(ps) if ps == &expected_prev_hash => continue,
                Some(ps) => {
                    return Err(Error::Integrity(format!(
                        "signatures[{}].prev_signature '{}' does not match sha256 of signatures[{}]",
                        i, ps, i - 1
                    )))
                }
                None => {
                    return Err(Error::Integrity(format!(
                        "signatures[{}] missing prev_signature (breaks chain)",
                        i
                    )))
                }
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Reject `..` path segments, absolute paths, drive letters, NUL bytes.
/// Returns canonicalized forward-slash form or `None` if unsafe.
fn sanitize_archive_path(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.contains('\0') {
        return None;
    }
    let norm = raw.replace('\\', "/");
    if norm.starts_with('/') {
        return None;
    }
    // Drive-letter check: `C:/...` or `C:\...` (already backslash-normalized).
    let bytes = norm.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return None;
    }
    let segments: Vec<&str> = norm.split('/').collect();
    for seg in &segments {
        if *seg == ".." {
            return None;
        }
    }
    Some(
        segments
            .into_iter()
            .filter(|s| !s.is_empty() && *s != ".")
            .collect::<Vec<_>>()
            .join("/"),
    )
}

#[cfg(feature = "verify")]
fn parse_hash(declared: &str) -> Result<(String, String), Error> {
    let (algo, expected) = declared.split_once(':').ok_or_else(|| {
        Error::Integrity(format!("hash '{}' missing ':' separator", declared))
    })?;
    Ok((algo.to_ascii_lowercase(), expected.to_ascii_lowercase()))
}

#[cfg(feature = "verify")]
fn hash_bytes(algo: &str, bytes: &[u8]) -> Result<String, Error> {
    match algo {
        "sha256" => Ok(sha256_hex(bytes)),
        "sha512" => {
            let mut hasher = sha2::Sha512::new();
            hasher.update(bytes);
            Ok(hex::encode(hasher.finalize()))
        }
        "blake3" => Err(Error::Integrity(
            "blake3 verification not implemented in this binding (spec'd but deferred)".into(),
        )),
        other => Err(Error::Integrity(format!(
            "unsupported hash algorithm: {}",
            other
        ))),
    }
}

#[cfg(feature = "verify")]
fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = sha2::Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_rejects_parent_traversal() {
        assert_eq!(sanitize_archive_path("../etc/passwd"), None);
        assert_eq!(sanitize_archive_path("a/../b"), None);
    }

    #[test]
    fn sanitize_rejects_absolute_paths() {
        assert_eq!(sanitize_archive_path("/etc/passwd"), None);
        assert_eq!(sanitize_archive_path("C:/Windows"), None);
        assert_eq!(sanitize_archive_path("C:\\Windows"), None);
    }

    #[test]
    fn sanitize_rejects_nul_bytes() {
        assert_eq!(sanitize_archive_path("a\0b"), None);
    }

    #[test]
    fn sanitize_preserves_legitimate_paths() {
        assert_eq!(
            sanitize_archive_path("assets/images/fig.png").as_deref(),
            Some("assets/images/fig.png")
        );
    }

    #[test]
    fn sanitize_normalizes_backslashes() {
        assert_eq!(
            sanitize_archive_path("assets\\images\\fig.png").as_deref(),
            Some("assets/images/fig.png")
        );
    }

    #[cfg(feature = "verify")]
    #[test]
    fn parse_hash_splits_on_colon() {
        assert_eq!(
            parse_hash("sha256:abc123").unwrap(),
            ("sha256".into(), "abc123".into())
        );
    }

    #[cfg(feature = "verify")]
    #[test]
    fn parse_hash_rejects_missing_separator() {
        assert!(parse_hash("sha256abc").is_err());
    }

    #[cfg(feature = "verify")]
    #[test]
    fn hash_sha256_matches_known_vector() {
        // Known test vector: sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
        let out = hash_bytes("sha256", b"abc").unwrap();
        assert_eq!(
            out,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
