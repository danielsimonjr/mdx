# tree-sitter-mdz

Tree-sitter grammar for the MDZ (Markdown Zipped) directive syntax.

**Status: 0.1.0-alpha — scaffold only.**

## What this is

A Tree-sitter grammar that parses the MDZ-specific syntax extensions on top
of CommonMark:

- `::cell`, `::output`, `::include` directive blocks
- `{.class #id key="value"}` attribute lines
- `{:.center}` shorthand alignment
- `:::name{attrs}` container blocks

It's designed to be **composed** with an existing
`tree-sitter-markdown` grammar (the CommonMark host), not to re-implement
Markdown. Use injections in `queries/injections.scm` to hand non-MDZ lines
to the markdown grammar.

## Why tree-sitter

Tree-sitter parsers are:

- **Incremental** — edits re-parse only the affected region. Crucial for
  editor integration.
- **Error-tolerant** — produces a parse tree even on syntactically broken
  input. You get highlighting during typing, not just after save.
- **Editor-native** — VS Code, Neovim, Helix, Zed, and GitHub's syntax
  highlighting all use tree-sitter.

Once this grammar is complete and published, all these editors get MDZ
syntax highlighting for free.

## What's missing (roadmap)

This is `0.1.0-alpha`. To reach `1.0.0`:

- [ ] Complete grammar rules matching `spec/grammar/mdz-directives.abnf`
- [ ] Cell source fencing (currently handled by host markdown grammar —
      consider taking it over)
- [ ] Labeled blocks (`::fig`, `::eq`, `::tab`) with id extraction
- [ ] Cross-reference (`::ref[id]`) and citation (`::cite[key]`) as inline
      tokens
- [ ] `queries/highlights.scm` — syntax highlighting queries
- [ ] `queries/injections.scm` — inject markdown grammar for non-MDZ lines
- [ ] `queries/locals.scm` — scope labels and references for go-to-def
- [ ] Test corpus under `test/corpus/` (tree-sitter's native test format)
- [ ] Node.js bindings, Rust bindings, WASM build for web viewer

## Building (when complete)

```bash
# Install tree-sitter CLI
npm install -g tree-sitter-cli

# Generate the parser C source from grammar.js
tree-sitter generate

# Run the corpus tests
tree-sitter test

# Parse a file
tree-sitter parse examples/v2/parser-fixtures/cell-basic.md
```

## Editor integration (when complete)

### VS Code

Register via a VS Code extension that bundles the WASM build:

```typescript
import Parser from "web-tree-sitter";
await Parser.init();
const MDZ = await Parser.Language.load("tree-sitter-mdz.wasm");
```

### Neovim

Via `nvim-treesitter`:

```lua
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()
parser_config.mdz = {
  install_info = {
    url = "https://github.com/danielsimonjr/mdx/tree/main/tree-sitter-mdz",
    files = {"src/parser.c"},
  },
  filetype = "mdz",
}
```

## Source of truth

Grammar discrepancies are resolved in favor of `spec/grammar/mdz-directives.abnf`.
This `grammar.js` must track that ABNF; when the ABNF revises, this file is
regenerated (manually, for now — auto-generation from ABNF is a future nice-
to-have but not planned until adoption warrants it).

## Contributing

Wait until `0.2.0` before submitting queries (highlights, injections, etc.).
The grammar rules are still being finalized; queries written against an
alpha grammar will need rewriting.

Grammar rule contributions welcome — see CONTRIBUTING.md at the repo root.

## License

MIT. Same as the parent project.
