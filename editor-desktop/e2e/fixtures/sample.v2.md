# E2E sample

This archive is the deterministic fixture for Phase 2.3a.7 Playwright
specs. It contains exactly one of every directive the e2e suite needs
to exercise: a code cell, a figure, a locale split, and a snapshot
chain.

::fig{id=example src=assets/images/example.png alt="A 1×1 transparent
pixel — placeholder for fixture stability"}

::cell{language=python id=hello}
print("hello from the fixture")
::end

The fixture is built deterministically by
`editor-desktop/e2e/fixtures/build-fixtures.mjs`; rerunning the
script must produce a byte-identical archive (fflate uses the ZIP
epoch for mtime).

_Updated for snapshot v2._
