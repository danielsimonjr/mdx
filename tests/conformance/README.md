# MDZ Conformance Test Suite

Interoperability enforcement for MDZ parsers. Any implementation claiming
"MDZ v2.1 Core conformant" must pass 100% of the Core fixtures here.
Advanced-profile conformance is a superset.

## Structure

```
tests/conformance/
├── README.md            ← this file
├── positive/            ← MUST accept; AST matches expected.json
├── negative/            ← MUST reject with ParseError; line number matches
├── roundtrip/           ← parse → serialize → parse produces same AST
├── edge/                ← Unicode, RTL, surrogate pairs, large files
└── run_conformance.py   ← test runner for the Python reference parser
```

Each fixture is a pair: `<name>.md` + `<name>.expected.json` (positive,
roundtrip, edge) or `<name>.md` + `<name>.expected-error.json` (negative).

The `.expected-error.json` file declares:

```json
{
  "error_contains": "unterminated fenced code block",
  "line": 5
}
```

A negative fixture passes if the parser raises `ParseError` whose message
contains the `error_contains` substring and whose `.line` attribute equals
`line`.

## Cross-implementation contract

Every conformance fixture is run against:

1. The Python Lark parser (`implementations/python/mdz_parser`).
2. The TypeScript parser (Phase 1.2 deliverable).
3. Any third-party implementation submitted for conformance review.

Byte-compare the resulting ASTs (JSON-serialized, sorted keys). Any
divergence is a bug in one of the parsers; the ABNF grammar
(`spec/grammar/mdz-directives.abnf`) is the tiebreaker.

## Running

```bash
# Python reference parser
python tests/conformance/run_conformance.py

# Specific category
python tests/conformance/run_conformance.py --category positive

# Specific fixture
python tests/conformance/run_conformance.py --only positive/cell-basic.md
```

## Coverage goals

- **Core grammar:** every production in the ABNF has ≥1 positive fixture
  and ≥1 negative fixture (where applicable).
- **v1.1 compat:** every fixture in `tests/alignment/` has a mirror here
  to lock behavior.
- **v2.0 additions:** cells, outputs, includes, labeled blocks, cross-refs,
  citations — all covered.
- **Edge cases:** empty documents, Unicode surrogate pairs, RTL text, very
  long lines (>10K chars), nested containers (≥10 deep), cells with
  exotic languages (r, julia, sql), mixed CRLF/LF line endings.
- **Regression fixtures:** every real-world bug we've fixed gets a fixture
  named `regression-<issue-number>.md` so it can never regress silently.

Current count: Phase 1 ships ~40 fixtures; Phase 2 grows to 200+ as real
documents appear.

## Adding a fixture

1. Create `<category>/<short-name>.md` with the input text.
2. Run the parser once manually; inspect the output.
3. If correct, save as `<category>/<short-name>.expected.json` (or
   `expected-error.json` for negative cases).
4. Rerun the full suite to confirm.
5. Commit both files together.

Fixture names must be:
- lowercase
- hyphen-separated
- ≤ 40 characters
- descriptive (`cell-with-image-output.md`, not `test-01.md`)

## Non-goals for this suite

- **CommonMark compliance.** That's the CommonMark spec's test suite.
  MDZ parsers are assumed to handle CommonMark correctly via whatever
  upstream library they use; we only test the MDZ layer.
- **Renderer output.** This suite covers parsing → AST, not AST → HTML.
  Viewer conformance is a separate suite (Phase 2).
- **Validator semantic rules.** Profile-specific validation (IMRaD
  sections, SPDX license, etc.) is tested under `tests/validator/`.
