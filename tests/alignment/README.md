# Alignment Conformance Tests

This directory contains test fixtures for MDX v1.1 alignment feature conformance.

## Test Files

| File | Description |
|------|-------------|
| `01-basic-alignment.md` | Basic left, center, right, justify alignment |
| `02-headings.md` | Alignment applied to headings |
| `03-lists.md` | Alignment applied to lists |
| `04-blockquotes.md` | Alignment applied to blockquotes |
| `05-directives.md` | Alignment applied to inline MDX directives (`::video`, `::model`, etc.) |
| `06-containers.md` | Container blocks (`:::{.align-*}`) grouping multiple elements |
| `07-precedence.md` | Attribute precedence rules |
| `08-combined-attributes.md` | Multiple attributes combined `{.class1 .class2 #id}` |
| `09-malformed.md` | Malformed syntax handling |
| `10-backward-compat.md` | Documents without alignment |

## Running the fixture validator

```bash
python tests/alignment/validate_fixtures.py
```

Exit 0 if every fixture contains the constructs its filename claims;
exit 1 otherwise. CI runs this on every push/PR.

**What this validates:**

- Each fixture matches the spec constructs its filename implies
  (e.g., `01-basic-alignment.md` must contain all four alignment
  shorthands; `09-malformed.md` must contain at least one malformed
  marker alongside a valid one).
- Regex-based detection of shorthand alignment, inline attributes,
  container blocks (3+ colons per CommonMark directive convention),
  inline directives (`::video`/`::model`/etc.), and malformed tokens
  per the v1.1 spec.

**What this does NOT validate** (yet):

- That a Markdown-to-HTML parser correctly produces the expected
  DOM. Currently no such parser is bundled in this repo — the
  viewer and editor rely on downstream renderers. When a reference
  parser is added, its output should be asserted against these
  fixtures using a golden-file pattern.

## Adding a new fixture

1. Name it `NN-short-description.md` where `NN` is the next
   two-digit index.
2. Add a row to the catalog table above.
3. Add an entry to the `EXPECTATIONS` dict in
   `validate_fixtures.py` describing what constructs the fixture
   must contain.
4. Run the validator to confirm it passes.
5. Commit both the fixture and the expectations together.

## Expected Behavior (for a future parser implementation)

Conforming renderers should:

1. Apply alignment classes to block elements
2. Generate CSS classes (not inline styles) when possible
3. Handle precedence: inline > block > container
4. Ignore malformed attribute blocks gracefully
5. Render documents without alignment using default left alignment
