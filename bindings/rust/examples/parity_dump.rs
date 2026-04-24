//! Parity harness helper — parse an archive with the `mdz` crate and
//! print a typed-subset manifest as JSON on stdout, built exclusively
//! from fields the typed API exposes.
//!
//! Crucially: this helper MUST NOT short-circuit to the raw manifest
//! bytes, because doing so makes the parity harness circular (see
//! `tests/parity/rust_ts_manifest_parity.py`). If the Rust binding
//! silently drops a field, the emitted JSON must differ from the
//! TS-projected manifest so the diff surfaces.
//!
//! Usage:
//!     cargo run --example parity_dump -- path/to/archive.mdz

use std::fs;
use std::path::PathBuf;

use mdz::{Archive, Role};
use serde_json::{json, Map, Value};

fn role_to_string(role: &Role) -> String {
    match role {
        Role::Author => "author".into(),
        Role::Reviewer => "reviewer".into(),
        Role::Editor => "editor".into(),
        Role::Publisher => "publisher".into(),
        Role::Notary => "notary".into(),
        // Custom holds the raw string verbatim (post spec §16.2
        // widening). Do NOT synthesize a `custom:` prefix here.
        Role::Custom(s) => s.clone(),
    }
}

/// Insert `key -> Value::from(v)` into `map` only if `v` is `Some`. Cuts
/// the `if let Some(x) = ... { map.insert(...) }` boilerplate that
/// otherwise dominates this file.
fn insert_opt<T: serde::Serialize>(map: &mut Map<String, Value>, key: &str, v: &Option<T>) {
    if let Some(val) = v {
        // to_value is infallible for all types used here (String/Vec<String>).
        map.insert(key.into(), serde_json::to_value(val).unwrap());
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path: PathBuf = std::env::args()
        .nth(1)
        .ok_or("usage: parity_dump <archive>")?
        .into();
    let bytes = fs::read(&path)?;
    let archive = Archive::open(&bytes)?;
    let m = archive.manifest();

    // Build the typed-subset JSON by reading from the typed struct
    // fields exclusively. The Python harness mirrors this projection.
    let mut doc = Map::new();
    doc.insert("id".into(), json!(m.document.id));
    insert_opt(&mut doc, "content_id", &m.document.content_id);
    doc.insert("title".into(), json!(m.document.title));
    insert_opt(&mut doc, "subtitle", &m.document.subtitle);
    insert_opt(&mut doc, "language", &m.document.language);
    doc.insert("created".into(), json!(m.document.created));
    doc.insert("modified".into(), json!(m.document.modified));
    // License: re-serialize the untagged enum to its JSON shape.
    if let Some(lic) = &m.document.license {
        doc.insert(
            "license".into(),
            match lic {
                mdz::License::Spdx(s) => json!(s),
                mdz::License::Structured { kind, url } => {
                    let mut o = Map::new();
                    o.insert("type".into(), json!(kind));
                    insert_opt(&mut o, "url", url);
                    Value::Object(o)
                }
            },
        );
    }
    if !m.document.authors.is_empty() {
        let arr: Vec<Value> = m
            .document
            .authors
            .iter()
            .map(|a| {
                let mut o = Map::new();
                o.insert("name".into(), json!(a.name));
                insert_opt(&mut o, "email", &a.email);
                insert_opt(&mut o, "url", &a.url);
                insert_opt(&mut o, "did", &a.did);
                insert_opt(&mut o, "role", &a.role);
                insert_opt(&mut o, "organization", &a.organization);
                Value::Object(o)
            })
            .collect();
        doc.insert("authors".into(), Value::Array(arr));
    }

    let mut content = Map::new();
    content.insert("entry_point".into(), json!(m.content.entry_point));
    if let Some(locales) = &m.content.locales {
        let avail: Vec<Value> = locales
            .available
            .iter()
            .map(|a| {
                let mut o = Map::new();
                o.insert("tag".into(), json!(a.tag));
                o.insert("entry_point".into(), json!(a.entry_point));
                insert_opt(&mut o, "title", &a.title);
                Value::Object(o)
            })
            .collect();
        let mut lo = Map::new();
        lo.insert("default".into(), json!(locales.default));
        lo.insert("available".into(), Value::Array(avail));
        if !locales.fallback.is_empty() {
            lo.insert("fallback".into(), json!(locales.fallback));
        }
        content.insert("locales".into(), Value::Object(lo));
    }

    let mut out = Map::new();
    out.insert("mdx_version".into(), json!(m.mdx_version));
    out.insert("document".into(), Value::Object(doc));
    out.insert("content".into(), Value::Object(content));

    if let Some(sec) = &m.security {
        let sigs: Vec<Value> = sec
            .signatures
            .iter()
            .map(|s| {
                let mut o = Map::new();
                o.insert("role".into(), json!(role_to_string(&s.role)));
                let mut signer = Map::new();
                signer.insert("name".into(), json!(s.signer.name));
                insert_opt(&mut signer, "did", &s.signer.did);
                o.insert("signer".into(), Value::Object(signer));
                o.insert("algorithm".into(), json!(s.algorithm));
                o.insert("signature".into(), json!(s.signature));
                insert_opt(&mut o, "prev_signature", &s.prev_signature);
                Value::Object(o)
            })
            .collect();
        let mut secmap = Map::new();
        secmap.insert("signatures".into(), Value::Array(sigs));
        if let Some(ic) = &sec.integrity {
            let mut io = Map::new();
            io.insert("algorithm".into(), json!(ic.algorithm));
            insert_opt(&mut io, "manifest_checksum", &ic.manifest_checksum);
            secmap.insert("integrity".into(), Value::Object(io));
        }
        out.insert("security".into(), Value::Object(secmap));
    }

    println!("{}", serde_json::to_string_pretty(&Value::Object(out))?);
    Ok(())
}
