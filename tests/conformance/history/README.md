# delta-snapshots-v1 conformance fixtures

Each subdirectory is one fixture. The runner
(`tests/conformance/history/run_history_conformance.js`) walks every
fixture, exercises the reader against it, and asserts the declared
behaviour.

## Fixture shape

```
<fixture>/
├── index.json              # the snapshot index under test
├── base/v1.0.0.md          # base files referenced by index
├── deltas/v*.patch         # patches referenced by index
└── expected.json           # what the runner should observe
```

`expected.json` is one of:

```jsonc
// Positive: every listed version reconstructs to the given file.
{
  "kind": "positive",
  "reconstructions": {
    "1.0.0": "expected/v1.0.0.md",
    "1.1.0": "expected/v1.1.0.md"
  }
}

// Negative: parsing OR resolving the named version must throw a
// SnapshotError matching this message substring.
{
  "kind": "negative",
  "phase": "parse" | "resolve" | "apply",
  "version": "1.1.0",          // omit for parse-phase failures
  "messageMatch": "circular"   // case-insensitive substring match
}
```

A conformant impl passes when:

- All `positive` fixtures reconstruct their listed versions to exactly
  the bytes in `expected/v*.md`.
- All `negative` fixtures throw at the declared phase with a message
  containing the declared substring.

## Why these specific fixtures

Each one pins one branch of the spec's "Conformance" + "Constraints +
errors" sections:

| Fixture | Pins |
|---------|------|
| `linear-chain` | The straight-line happy path: base → 3 deltas. |
| `branching-chains` | Multiple chains in one index (per spec: "An author / tool MAY create multiple bases"). |
| `circular` | "Readers MUST detect and reject" circular chains. |
| `missing-parent` | "If `deltas[].parent` references a version not in the chain, it's a validation error." |
| `duplicate-version` | Same `version` declared twice in one chain — caught at parse time. |

Future fixtures (TODO):

- `chain-too-deep` (>50; parameter-tunable)
- `unapplyable-patch` (patch context doesn't match parent)
- `mixed-delta-and-full` (transition-period archive carrying both)
