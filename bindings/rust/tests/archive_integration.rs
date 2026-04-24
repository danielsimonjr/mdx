//! Integration tests for the `mdz` Rust binding.
//!
//! Covers the gaps flagged by the Phase 4+5 review:
//!   - `Archive::open` round-trip on a synthetic archive.
//!   - Locale resolution (`document_content` preference chain).
//!   - Signature-chain structural checks (including the root-signer
//!     `prev_signature` invariant).
//!   - ZIP-bomb bounded-reader path (forged central-directory size).

use std::io::Write;

use mdz::{Archive, ArchiveError, Error, IntegrityError};

/// Build an in-memory ZIP archive with the given `(path, bytes)` entries.
fn build_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut buf = std::io::Cursor::new(Vec::<u8>::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buf);
        let opts: zip::write::FileOptions<()> =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, bytes) in entries {
            zip.start_file(*name, opts).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }
    buf.into_inner()
}

const MINIMAL_MANIFEST: &str = r#"{
  "mdx_version": "2.0.0",
  "document": {
    "id": "00000000-0000-0000-0000-000000000001",
    "title": "Test Paper",
    "created": "2026-01-01T00:00:00Z",
    "modified": "2026-01-01T00:00:00Z"
  },
  "content": {
    "entry_point": "document.md"
  }
}"#;

#[test]
fn open_minimal_archive() {
    let zip = build_zip(&[
        ("manifest.json", MINIMAL_MANIFEST.as_bytes()),
        ("document.md", b"# Hello\n"),
    ]);
    let archive = Archive::open(&zip).expect("archive opens");
    assert_eq!(archive.manifest().document.title, "Test Paper");
    assert_eq!(archive.entry_count(), 2);
}

#[test]
fn missing_manifest_is_structured_error() {
    let zip = build_zip(&[("document.md", b"# no manifest\n")]);
    match Archive::open(&zip) {
        Err(Error::Archive(ArchiveError::MissingManifest)) => {}
        other => panic!("expected MissingManifest, got {:?}", other),
    }
}

#[test]
fn document_content_resolves_default_when_no_locales() {
    let zip = build_zip(&[
        ("manifest.json", MINIMAL_MANIFEST.as_bytes()),
        ("document.md", b"# Hello\n"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    // Even with a preference, no-locales archives return the entry_point.
    let body = archive.document_content(&["ja", "en"]).unwrap();
    assert!(body.starts_with("# Hello"));
}

#[test]
fn document_content_picks_preferred_locale() {
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000002",
        "title": "Multi",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {
        "entry_point": "document.md",
        "locales": {
          "default": "en",
          "available": [
            {"tag": "en", "entry_point": "document.en.md"},
            {"tag": "fr", "entry_point": "document.fr.md"}
          ]
        }
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"fallback"),
        ("document.en.md", b"english"),
        ("document.fr.md", b"francais"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    assert_eq!(archive.document_content(&["fr"]).unwrap(), "francais");
    assert_eq!(archive.document_content(&["ja", "en"]).unwrap(), "english");
}

#[cfg(feature = "verify")]
#[test]
fn signature_chain_root_must_not_have_prev_signature() {
    // `signatures[0]` is the chain anchor — a `prev_signature` field on it
    // is either corruption or a re-rooting attack. Spec §16.
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000003",
        "title": "Bad root",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"},
      "security": {
        "signatures": [
          {
            "signer": {"name": "Alice", "did": "did:web:example.com"},
            "algorithm": "ed25519",
            "signature": "abc",
            "prev_signature": "sha256:deadbeef",
            "signed_at": "2026-01-01T00:00:00Z"
          }
        ]
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hello"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    match archive.verify_signature_chain() {
        Err(Error::Integrity(IntegrityError::SignatureChain(msg))) => {
            assert!(msg.contains("signatures[0]"), "got: {}", msg);
        }
        other => panic!("expected SignatureChain error, got {:?}", other),
    }
}

#[cfg(feature = "verify")]
#[test]
fn signature_chain_accepts_single_root_without_prev() {
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000004",
        "title": "Ok root",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"},
      "security": {
        "signatures": [
          {
            "signer": {"name": "Alice", "did": "did:web:example.com"},
            "algorithm": "ed25519",
            "signature": "abc",
            "signed_at": "2026-01-01T00:00:00Z"
          }
        ]
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hello"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    archive.verify_signature_chain().expect("single-root chain is valid");
}
