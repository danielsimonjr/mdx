# MDZ signature trust model

**Spec status:** Draft (Phase 3.1). Pairs with `THREAT_MODEL.md` and
`CSP.md` to give viewers + verifiers a complete security baseline.

**Audience:** implementers of `mdz verify`, `<mdz-viewer>`, and
preprint-server ingest pipelines that need to decide whether to trust
the signatures in an incoming archive.

---

## What this document covers

How a reader / viewer / verifier:

1. **Discovers** the public key for each signer in
   `manifest.security.signatures[]`.
2. **Decides** whether that signer is trusted in the current context.
3. **Checks** whether a signer's key has been revoked.
4. **Handles** key rotation across versions of the same archive.

What this document does NOT cover (out of scope):

- The cryptographic primitives themselves (Ed25519 / RS256 / ES256).
  Those are `THREAT_MODEL.md` material.
- Signature-chain *structural* invariants (`prev_signature`, root
  anchor). Those live in spec §16 and are exercised by
  `cli/test/verify.test.js` + `bindings/rust/tests/archive_integration.rs`.
- HTTPS / TLS posture for the network that delivers the archive. Out
  of MDZ's scope.

---

## 1. Signer identity

Every entry in `security.signatures[]` carries:

```json
{
  "role": "author",
  "signer": {
    "name": "Alice Smith",
    "did": "did:web:alice.example.com"
  },
  "algorithm": "Ed25519",
  "signature": "<base64>",
  "prev_signature": "sha256:<hex>"
}
```

The **`signer.did`** field is the canonical identity. The `signer.name`
is for human display only and MUST NOT influence trust decisions.

If `signer.did` is absent (allowed by the schema for legacy reasons),
the signature SHOULD be treated as *low-trust* — it can be
structurally valid but cannot be cryptographically verified, because
there is no key-discovery path.

---

## 2. Key discovery — the resolution chain

A reader resolves a signer's public key by trying each strategy in
order until one succeeds:

### 2.1 `did:web` (preferred)

```
did:web:example.com:users:alice
```

resolves to:

```
https://example.com/users/alice/did.json
```

The DID document at that URL contains `verificationMethod[]` entries
with `publicKeyJwk` or `publicKeyMultibase` material. Readers MUST:

- Use HTTPS (TLS-validated against the system trust store). HTTP is
  REJECTED.
- Honor `Cache-Control` headers; default to a 1-hour cache when none
  is set.
- Refuse the resolution if the DID document's `id` field does not
  match the requested DID (defense against DNS rebinding /
  misdirection).

### 2.2 `did:key` (self-describing)

```
did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH
```

The key material is *encoded into the DID itself*. Readers extract it
directly without a network round-trip. This is the right method for
offline / air-gapped review workflows but provides no revocation path
(see §4).

### 2.3 Trust-file fallback (`mdz verify --trust keys.json`)

For airgapped / institutional contexts, the verifier accepts a
`--trust` file:

```json
{
  "trustAll": false,
  "allowedDids": [
    "did:web:journal.example.com",
    "did:key:z6Mk..."
  ],
  "publicKeys": {
    "did:web:journal.example.com": {
      "algorithm": "Ed25519",
      "key": "<base64-or-jwk>"
    }
  }
}
```

When a trust file is provided, the verifier MUST NOT touch the network
— it ONLY accepts signers whose DIDs appear in `allowedDids`, and it
ONLY uses keys from `publicKeys`. The `cli/src/commands/verify.js` and
`cli/test/verify.test.js` reference implementations exercise this path.

### 2.4 `certificate` field (deprecated)

Pre-v2.0 archives sometimes carry an inline X.509 certificate in
`signer.certificate`. Readers MAY accept this form for backward
compat, but MUST treat it as low-trust unless the cert chain validates
against a system / institutional root (separate trust store from §2.3).

This branch is scheduled for removal in v3.0; new writers MUST emit a
`did` field instead.

---

## 3. Trust decisions

Key discovery returns a public key. Whether that key is *trusted in
this context* is a separate decision:

### 3.1 Default policy (viewer, no trust file)

- `did:web` resolutions over HTTPS: trusted (transitively trusts the
  TLS PKI).
- `did:key`: trusted (key material is in the DID itself; no external
  trust needed).
- `certificate`: low-trust unless the cert chain validates.

### 3.2 Strict policy (`--trust keys.json` or
`<mdz-viewer trust-policy="strict">`)

- ONLY signers in `allowedDids` are trusted. All others surface as
  *visible warnings*: rendered with a `mdz-untrusted-signer` class on
  the signature display widget.
- The archive's content STILL renders (so reviewers can read it), but
  the trust badge in the UI says "untrusted signers."

### 3.3 No-network policy (`--offline`)

- Network-dependent strategies (§2.1, §2.4-cert-chain) are SKIPPED.
- Only `did:key` resolves; `did:web` surfaces "cannot verify offline"
  per signature.

---

## 4. Revocation

MDZ does not invent its own revocation protocol. Readers consult the
underlying DID method's revocation channel:

### 4.1 `did:web` revocation

The DID document at `https://example.com/.../did.json` carries the
*current* `verificationMethod[]`. A revoked key is removed (or marked
`deactivated: true` per the DID Core spec's `service` deactivation
semantics). Readers MUST refuse a signature whose key is no longer
listed in the *currently-resolved* DID document.

This means a signature that was valid when written can become *expired*
later — which is the desired behavior for "signer's key was
compromised, revoke from publication date forward."

### 4.2 `did:key` revocation

`did:key` has **no native revocation**. The key material is the DID;
"revocation" requires an out-of-band signal. Readers SHOULD treat
long-lived `did:key` signatures (>2 years from `signed_at`) with
suspicion, surfacing a "key rotation recommended" hint.

### 4.3 Revocation-list extension (proposed v2.1)

A future v2.1 spec extension MAY allow archives to declare:

```json
"security": {
  "revocations": {
    "url": "https://example.com/mdz-revocations.json"
  }
}
```

The referenced JSON would carry a list of revoked DID-key tuples with
revocation timestamps. Readers cache it per `Cache-Control` and
re-validate on each verify. Out of scope for v2.0.

---

## 5. Key rotation

When a signer rotates their key (legitimate replacement, not a
revocation):

### 5.1 Forward chain

The new archive version's signature uses the new key. The chain link
via `prev_signature` is preserved (the hash chain doesn't care about
the key, only about the previous *signature bytes*).

### 5.2 Historical verification

A v2 of an archive cannot retroactively re-sign v1 with the new key —
v1's signatures stay valid until the *old* key is revoked at the DID
level. Readers verifying a multi-version chain MUST resolve the DID
document **as of `signed_at`**, not the current document.

For `did:web`, this means consulting an archive (Internet Archive or
Wayback Machine) of the DID document at the historical timestamp. In
practice, most readers do not implement this — they verify against
*current* DID state and accept that long-historical signatures may
fail to verify after key rotation.

A best-effort heuristic: if the current DID document carries a
`previousVersionUri` or `priorKeys[]` field (some DID methods support
this), consult it before failing the signature.

### 5.3 Signing the rotation event itself

The recommended pattern:

1. New v2.1 of the archive carries a **rotation signature** at the
   chain root, signed with both the OLD and NEW keys (a "co-sign").
2. Subsequent versions sign with the NEW key only.

This gives readers a verifiable break-point: any chain that includes
a co-signed rotation entry is provably consistent across the rotation.

---

## 6. What viewers / verifiers MUST surface to users

A conformant reader/viewer SHOULD render, on the document UI:

- The list of signers (role + name + DID).
- Trust status per signer (`verified` / `unverified` / `revoked` /
  `cannot-verify-offline`).
- Aggregate trust summary at archive level: "fully signed", "partially
  signed", "unsigned", or "signature chain broken".
- For `--trust`-restricted contexts, an `mdz-untrusted-signer` class
  on the signer-display element so CSS / UI can call out signers
  outside the policy.

Viewers MUST NOT display "verified" without having actually performed
verification. Static archives where verification is deferred SHOULD
display "verification pending" until the verify step completes.

---

## 7. Reference implementations

| Path | What it does |
|------|--------------|
| `cli/src/commands/verify.js` | Node verifier; structural chain checks + DID-list trust policy. **Does NOT** yet perform actual cryptographic signature verification (Ed25519/RS256/ES256 over the manifest bytes) — that is Phase 3.2. |
| `cli/test/verify.test.js` | Tests for the structural side: chain root, prev_signature, missing DID, trust-file allowlist. |
| `bindings/rust/src/lib.rs` (`verify_signature_chain`) | Rust binding's structural-chain verifier; same Phase 3.2 caveat. |
| `bindings/rust/tests/archive_integration.rs` | Tests for the Rust binding's signature-chain assertions. |

When Phase 3.2 lands, this document gets a §8 covering the actual
cryptographic verification flow + algorithm-specific notes (Ed25519
constant-time-only, RS256 modulus-size minima, ES256 curve
restrictions).

---

## Open questions

1. **Should viewers cache resolved DID documents across origins?** A
   shared cache speeds up verification for popular signers (journal
   editorial boards) but creates a tracking-signal across origins
   (which papers a reader has verified). Current proposal: cache
   per-origin.
2. **Cross-archive key rotation lookup.** If paper P1 says "Alice's
   `did:web:alice.example.com` rotated on 2026-03-01" and paper P2
   was signed before that date, can a reader use P1's metadata to
   correctly verify P2 historically? Probably not without a global
   trust ledger; out of scope for v2.0.
3. **Multi-signer rotation.** What if two co-signers rotate keys
   simultaneously? Each rotation is independent at the DID level, but
   the chain order matters for signature ordering. Current spec is
   silent; needs §16 follow-up.
