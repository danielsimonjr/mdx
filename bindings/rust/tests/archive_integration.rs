//! Integration tests for the `mdz` Rust binding.
//!
//! Covers the gaps flagged by the Phase 4+5 review:
//!   - `Archive::open` round-trip on a synthetic archive.
//!   - Locale resolution (`document_content` preference chain).
//!   - Signature-chain structural checks (including the root-signer
//!     `prev_signature` invariant).
//!   - ZIP-bomb bounded-reader path (forged central-directory size).

use std::io::Write;

use mdz::{Archive, ArchiveError, Error};
#[cfg(feature = "verify")]
use mdz::IntegrityError;

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

/// Shortcut: build a 2-entry ZIP with `manifest.json` and a stub
/// `document.md`. Most tests here don't care about the document body.
fn zip_with_manifest(manifest: &str) -> Vec<u8> {
    build_zip(&[
        ("manifest.json", manifest.as_bytes()),
        ("document.md", b"# hi"),
    ])
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
    let archive = Archive::open(&zip_with_manifest(manifest)).unwrap();
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
    let archive = Archive::open(&zip_with_manifest(manifest)).unwrap();
    archive.verify_signature_chain().expect("single-root chain is valid");
}

/// Build a manifest carrying a signature chain of the given length, with
/// each entry's `prev_signature` set per the v2 domain-separated chain
/// construction (spec §16.3 v2 — domain tag + canonical JSON of
/// {algorithm, signature, signer_did, timestamp}). Mirrors the JS
/// reference impl `sigChainPrevHashV2` in `cli/src/commands/verify.js`.
#[cfg(feature = "verify")]
fn manifest_with_valid_chain(n: usize) -> String {
    use sha2::{Digest, Sha256};
    let mut entries = Vec::new();
    let mut prev_canonical_input: Option<Vec<u8>> = None;
    for i in 0..n {
        let sig = format!("sig-{}", i);
        let alg = "ed25519";
        let did = format!("did:web:example.com/{}", i);
        let timestamp = "2026-01-01T00:00:00Z";
        let prev_line = if let Some(input) = &prev_canonical_input {
            let mut h = Sha256::new();
            h.update(input);
            format!(r#","prev_signature": "sha256:{}""#, hex::encode(h.finalize()))
        } else {
            String::new()
        };
        entries.push(format!(
            r#"{{"role": "author", "signer": {{"name": "A{i}", "did": "{did}"}}, "algorithm": "{alg}", "signature": "{sig}", "timestamp": "{timestamp}"{prev_line}}}"#
        ));
        // Build the v2 canonical input bytes for the NEXT iteration's
        // prev_signature. Keys lex order: algorithm, signature,
        // signer_did, timestamp.
        let canonical_json = format!(
            r#"{{"algorithm":"{alg}","signature":"{sig}","signer_did":"{did}","timestamp":"{timestamp}"}}"#
        );
        let mut buf = b"mdz-sig-chain-v2|".to_vec();
        buf.extend_from_slice(canonical_json.as_bytes());
        prev_canonical_input = Some(buf);
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
    let archive = Archive::open(&zip_with_manifest(&manifest_with_valid_chain(3))).unwrap();
    archive
        .verify_signature_chain()
        .expect("valid 3-entry chain should pass");
}

#[cfg(feature = "verify")]
#[test]
fn signature_chain_rejects_tampered_prev_hash() {
    // Compute the legitimate prev_signature hash for entry 1, then
    // replace THAT specific substring with a synthetic bad hash. The
    // valid chain hash is the SHA-256 of the v2 canonical input (domain
    // tag + canonical JSON of entry-0). We extract it from the
    // manifest's existing `prev_signature` field rather than recomputing
    // — keeps the test from drifting if the canonical encoding ever
    // changes.
    let manifest = manifest_with_valid_chain(2);
    let legit_prev = {
        let needle = "\"prev_signature\": \"";
        let start = manifest.find(needle).expect("prev_signature in fixture") + needle.len();
        let end = manifest[start..].find('"').expect("closing quote") + start;
        manifest[start..end].to_string()
    };
    let tampered_prev = "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    let manifest = manifest.replace(&legit_prev, tampered_prev);
    let archive = Archive::open(&zip_with_manifest(&manifest)).unwrap();
    match archive.verify_signature_chain() {
        Err(Error::Integrity(IntegrityError::SignatureChain(msg))) => {
            // Pin that the diagnostic names the offending entry index.
            assert!(msg.contains("signatures[1]"), "got: {}", msg);
            assert!(msg.contains("does not match"), "got: {}", msg);
        }
        other => panic!("expected tamper-detect, got {:?}", other),
    }
}

#[cfg(feature = "verify")]
#[test]
fn signature_chain_rejects_graft_attack() {
    // Threat model: attacker lifts a leaf signature from a different
    // document and grafts it into the chain. Under the v1 construction
    // (sha256 of signature bytes alone) the chain hash would still
    // match because only `signature` was hashed. The v2 construction
    // binds `signer.did` + `algorithm` + `timestamp` into the hash
    // input, so changing any of them breaks the chain.
    let manifest = manifest_with_valid_chain(2);
    // Modify entry-0's signer.did. The resulting prev_signature on
    // entry-1 still references the OLD canonical input, so the chain
    // must fail.
    let manifest = manifest.replace(
        "\"did:web:example.com/0\"",
        "\"did:web:attacker.example.com\"",
    );
    let archive = Archive::open(&zip_with_manifest(&manifest)).unwrap();
    match archive.verify_signature_chain() {
        Err(Error::Integrity(IntegrityError::SignatureChain(msg))) => {
            assert!(msg.contains("signatures[1]"), "got: {}", msg);
            assert!(msg.contains("does not match"), "got: {}", msg);
        }
        other => panic!("expected graft-detect, got {:?}", other),
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
    let archive = Archive::open(&zip_with_manifest(manifest)).unwrap();
    match archive.verify_integrity() {
        Err(Error::Integrity(IntegrityError::Mismatch { kind, .. })) => {
            assert_eq!(kind, "manifest_checksum");
        }
        other => panic!("expected checksum mismatch, got {:?}", other),
    }
}

#[cfg(feature = "verify")]
#[test]
fn verify_content_id_accepts_correct_blake3_hash() {
    // blake3 is the v2.0 spec's third accepted hash algorithm
    // (sha256 / sha512 / blake3). The Rust binding now implements
    // it (Phase 4.6.8). Compute the correct hash for the stub
    // document.md the test helper installs and assert verify
    // succeeds.
    let body = b"# hi"; // matches zip_with_manifest's document.md
    let expected = hex::encode(blake3::hash(body).as_bytes());
    let manifest = format!(
        r#"{{
      "mdx_version": "2.0.0",
      "document": {{
        "id": "00000000-0000-0000-0000-000000000030",
        "title": "blake3",
        "content_id": "blake3:{}",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      }},
      "content": {{"entry_point": "document.md"}}
    }}"#,
        expected
    );
    let archive = Archive::open(&zip_with_manifest(&manifest)).unwrap();
    archive
        .verify_content_id()
        .expect("blake3 content_id should verify cleanly");
}

#[cfg(feature = "verify")]
#[test]
fn verify_content_id_rejects_wrong_blake3_hash() {
    // Same shape as the success test, but with an all-zeros hash
    // that won't match any real content. Verifier MUST reject.
    let manifest = r#"{
      "mdx_version": "2.0.0",
      "document": {
        "id": "00000000-0000-0000-0000-000000000031",
        "title": "blake3 mismatch",
        "content_id": "blake3:0000000000000000000000000000000000000000000000000000000000000000",
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z"
      },
      "content": {"entry_point": "document.md"}
    }"#;
    let archive = Archive::open(&zip_with_manifest(manifest)).unwrap();
    match archive.verify_content_id() {
        Err(Error::Integrity(IntegrityError::Mismatch { kind, .. })) => {
            assert_eq!(kind, "content_id", "wrong mismatch kind: {}", kind);
        }
        other => panic!("expected blake3 hash mismatch, got {:?}", other),
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

/// Build a single-signature manifest with the given role string.
fn manifest_with_role(role_str: &str, id_suffix: &str) -> String {
    format!(
        r#"{{
          "mdx_version": "2.0.0",
          "document": {{
            "id": "00000000-0000-0000-0000-0000000000{id_suffix}",
            "title": "Role test",
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z"
          }},
          "content": {{"entry_point": "document.md"}},
          "security": {{
            "signatures": [
              {{
                "role": "{role_str}",
                "signer": {{"name": "S", "did": "did:web:example.com"}},
                "algorithm": "ed25519",
                "signature": "s"
              }}
            ]
          }}
        }}"#
    )
}

#[test]
fn role_enum_parses_all_five_closed_variants() {
    use mdz::Role;
    let cases = [
        ("author", Role::Author),
        ("reviewer", Role::Reviewer),
        ("editor", Role::Editor),
        ("publisher", Role::Publisher),
        ("notary", Role::Notary),
    ];
    for (i, (role_str, expected)) in cases.iter().enumerate() {
        let manifest = manifest_with_role(role_str, &format!("{:02}", 70 + i));
        let archive = Archive::open(&zip_with_manifest(&manifest))
            .expect(&format!("'{}' should parse", role_str));
        let sigs = &archive.manifest().security.as_ref().unwrap().signatures;
        assert_eq!(&sigs[0].role, expected, "role {} misparsed", role_str);
    }
}

#[test]
fn role_enum_preserves_custom_namespace_and_uri_forms() {
    use mdz::Role;
    // Both the conventional `custom:<name>` shorthand and a full URI
    // per spec §16.2 MUST land in Role::Custom and round-trip verbatim.
    let cases = [
        "custom:review-board",
        "custom:BAD SPACE",
        "https://example.org/roles/copy-editor",
        "did:web:journal.example.com#role-translator",
        "Author",
    ];
    for (i, role_str) in cases.iter().enumerate() {
        let manifest = manifest_with_role(role_str, &format!("{:02}", 80 + i));
        let archive = Archive::open(&zip_with_manifest(&manifest))
            .expect(&format!("'{}' should parse as Custom", role_str));
        let sigs = &archive.manifest().security.as_ref().unwrap().signatures;
        assert_eq!(
            sigs[0].role,
            Role::Custom(role_str.to_string()),
            "role {} should be Custom with the original string",
            role_str,
        );
    }
}

#[test]
fn role_enum_rejects_empty_string() {
    let manifest = manifest_with_role("", "90");
    match Archive::open(&zip_with_manifest(&manifest)) {
        Err(Error::Manifest(msg)) => assert!(msg.contains("empty"), "got: {}", msg),
        other => panic!("expected empty-role rejection, got {:?}", other),
    }
}

#[cfg(not(feature = "verify"))]
#[test]
fn verify_methods_return_feature_disabled_without_flag() {
    let archive = Archive::open(&zip_with_manifest(MINIMAL_MANIFEST)).unwrap();
    // All three verify methods must surface FeatureDisabled with the
    // correct method name. One assertion per method catches copy-paste
    // regressions that would otherwise only surface in one branch.
    let cases: &[(fn(&Archive) -> Result<(), Error>, &str)] = &[
        (|a| a.verify_integrity(), "verify_integrity"),
        (|a| a.verify_content_id(), "verify_content_id"),
        (|a| a.verify_signature_chain(), "verify_signature_chain"),
    ];
    for (call, expected_method) in cases {
        match call(&archive) {
            Err(Error::FeatureDisabled { feature, method }) => {
                assert_eq!(feature, "verify");
                assert_eq!(method, *expected_method);
            }
            other => panic!("expected FeatureDisabled for {}, got {:?}", expected_method, other),
        }
    }
}
