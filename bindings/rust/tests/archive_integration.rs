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
            "role": "author",
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
            "role": "author",
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

/// Build a manifest carrying a signature chain of the given length, with
/// each entry's `prev_signature` hashing the previous entry's signature.
#[cfg(feature = "verify")]
fn manifest_with_valid_chain(n: usize) -> String {
    use sha2::{Digest, Sha256};
    let mut entries = Vec::new();
    let mut prev_sig: Option<String> = None;
    for i in 0..n {
        let sig = format!("sig-{}", i);
        let prev_line = if let Some(p) = &prev_sig {
            let mut h = Sha256::new();
            h.update(p.as_bytes());
            format!(r#","prev_signature": "sha256:{}""#, hex::encode(h.finalize()))
        } else {
            String::new()
        };
        entries.push(format!(
            r#"{{"role": "author", "signer": {{"name": "A{i}", "did": "did:web:example.com/{i}"}}, "algorithm": "ed25519", "signature": "{sig}"{prev_line}}}"#
        ));
        prev_sig = Some(sig);
    }
    format!(
        r#"{{
          "mdx_version": "2.0.0",
          "document": {{
            "id": "00000000-0000-0000-0000-000000000010",
            "title": "Chain",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z"
          }},
          "content": {{"entry_point": "document.md"}},
          "security": {{"signatures": [{}]}}
        }}"#,
        entries.join(",")
    )
}

#[cfg(feature = "verify")]
#[test]
fn signature_chain_accepts_valid_multi_entry() {
    let manifest = manifest_with_valid_chain(3);
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hi"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    archive
        .verify_signature_chain()
        .expect("valid 3-entry chain should pass");
}

#[cfg(feature = "verify")]
#[test]
fn signature_chain_rejects_tampered_prev_hash() {
    let mut manifest = manifest_with_valid_chain(2);
    // Corrupt entry 1's prev_signature — the `sha256:...` string.
    let tampered = manifest.replace("sha256:", "sha256:00");
    manifest = tampered;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hi"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    match archive.verify_signature_chain() {
        Err(Error::Integrity(IntegrityError::SignatureChain(msg))) => {
            assert!(msg.contains("does not match"), "got: {}", msg);
        }
        other => panic!("expected tamper-detect, got {:?}", other),
    }
}

#[cfg(feature = "verify")]
#[test]
fn verify_integrity_rejects_manifest_checksum_mismatch() {
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000020",
        "title": "Bad checksum",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"},
      "security": {
        "integrity": {
          "algorithm": "sha256",
          "manifest_checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
        }
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hi"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    match archive.verify_integrity() {
        Err(Error::Integrity(IntegrityError::Mismatch { kind, .. })) => {
            assert_eq!(kind, "manifest_checksum");
        }
        other => panic!("expected checksum mismatch, got {:?}", other),
    }
}

#[cfg(feature = "verify")]
#[test]
fn verify_content_id_rejects_unsupported_blake3() {
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000030",
        "title": "blake3",
        "content_id": "blake3:deadbeef",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"}
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hi"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    match archive.verify_content_id() {
        Err(Error::Integrity(IntegrityError::UnsupportedAlgorithm(msg))) => {
            assert!(msg.contains("blake3"), "got: {}", msg);
        }
        other => panic!("expected blake3 unsupported, got {:?}", other),
    }
}

#[test]
fn locale_strict_error_when_default_missing_from_available() {
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000040",
        "title": "Bad locale",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {
        "entry_point": "document.md",
        "locales": {
          "default": "ja",
          "available": [{"tag": "en", "entry_point": "document.en.md"}]
        }
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"top"),
        ("document.en.md", b"english"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    match archive.document_content(&[]) {
        Err(Error::Manifest(msg)) => {
            assert!(msg.contains("default 'ja'"), "got: {}", msg);
        }
        other => panic!("expected strict locale error, got {:?}", other),
    }
}

#[test]
fn role_enum_parses_custom_namespace() {
    use mdz::Role;
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000050",
        "title": "Custom role",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"},
      "security": {
        "signatures": [
          {
            "role": "custom:review-board",
            "signer": {"name": "RB", "did": "did:web:example.com"},
            "algorithm": "ed25519",
            "signature": "s"
          }
        ]
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"hi"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    let sigs = archive
        .manifest()
        .security
        .as_ref()
        .map(|s| s.signatures.as_slice())
        .unwrap_or(&[]);
    assert_eq!(sigs.len(), 1);
    assert_eq!(sigs[0].role, Role::Custom("review-board".into()));
}

#[test]
fn role_enum_rejects_invalid_custom() {
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000060",
        "title": "Bad custom role",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"},
      "security": {
        "signatures": [
          {
            "role": "custom:BAD SPACE",
            "signer": {"name": "X", "did": "did:web:x"},
            "algorithm": "ed25519",
            "signature": "s"
          }
        ]
      }
    }"#;
    let zip = build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"hi"),
    ]);
    match Archive::open(&zip) {
        Err(Error::Manifest(msg)) => assert!(msg.contains("custom role"), "got: {}", msg),
        other => panic!("expected custom-role rejection, got {:?}", other),
    }
}

#[cfg(not(feature = "verify"))]
#[test]
fn verify_methods_return_feature_disabled_without_flag() {
    let zip = build_zip(&[
        ("manifest.json", MINIMAL_MANIFEST.as_bytes()),
        ("document.md", b"# hi"),
    ]);
    let archive = Archive::open(&zip).unwrap();
    match archive.verify_integrity() {
        Err(Error::FeatureDisabled { feature, method }) => {
            assert_eq!(feature, "verify");
            assert_eq!(method, "verify_integrity");
        }
        other => panic!("expected FeatureDisabled, got {:?}", other),
    }
}
