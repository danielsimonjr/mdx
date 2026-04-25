# Archive-level integrity fixtures (Phase 3.2)

Each fixture is a JSON descriptor that tells the runner how to
assemble a deliberately-broken `.mdz` archive in-memory, plus what
the verifier MUST reject it for.

```
<fixture>/
├── descriptor.json   # how to build the archive + expected error
└── README.md         # one-paragraph rationale (optional)
```

Descriptor shape:

```json
{
  "kind": "negative",
  "title": "human-readable name",
  "rationale": "why this archive is broken",
  "manifest": { "mdx_version": "2.0.0", "document": { "...": "..." } },
  "files": {
    "document.md": "# content\n",
    "assets/data.csv": "x,y\n1,2\n"
  },
  "expected_error": {
    "rule": "content_hash_mismatch",
    "messageMatch": "content_hash"
  }
}
```

Runner: `tests/conformance/integrity/run_integrity_conformance.js`
walks every fixture, assembles the archive in-memory, hands it to
the CLI's `verify` command, and asserts the verifier rejects it
with the declared rule/message. Reuses `cli/src/lib/snapshots.js`
patterns for predictable error output.

## Why a separate harness from `run_conformance.py`

`run_conformance.py` exercises the parser at the .md text level —
it can't test archive-shape problems (manifest hash mismatches,
ZIP-entry tampering) because there's no archive in the input. The
two harnesses cover orthogonal layers.

## Fixture catalogue

| Fixture | Pins |
|---|---|
| `content-hash-mismatch` | manifest declares `document.content_id` whose hash doesn't match the inflated `document.md` |
| `manifest-checksum-mismatch` | `security.integrity.manifest_checksum` is wrong — the verify command MUST reject as the integrity anchor is broken |
| `manifest-missing-mdx-version` | required field `mdx_version` is absent — verifier MUST reject with a clear field-missing error |
| `asset-hash-mismatch` | `manifest.assets.data[0].content_hash` doesn't match the actual asset bytes — Phase 4.6.9 extended the verify command to walk per-asset hashes; this fixture confirms the rejection path |
