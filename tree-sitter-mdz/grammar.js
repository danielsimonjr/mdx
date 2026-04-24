/**
 * @file Tree-sitter grammar for MDZ (Markdown Zipped) directive syntax.
 *
 * @version 0.1.0-alpha
 * @license MIT
 *
 * Status: SCAFFOLD. This grammar is minimally viable for syntax highlighting
 * and basic go-to-definition but is not yet a complete implementation of
 * spec/grammar/mdz-directives.abnf. See ROADMAP.md §1.1 for completion plan.
 *
 * Scope of this scaffold:
 *   - Fenced code blocks (matched by the CommonMark host)
 *   - ::cell, ::output, ::include directive openings
 *   - {.class #id key="value"} attribute lines
 *   - {:.center} shorthand alignment
 *   - ::: container open/close
 *
 * Out of scope (delegated to the CommonMark parser this is injected into):
 *   - Headings, paragraphs, lists, emphasis, links, images
 *
 * Tree-sitter grammars often inject into markdown-inline. This grammar is
 * designed to be composable with tree-sitter-markdown's block grammar —
 * see injections.scm in the queries/ directory (TBD).
 */

module.exports = grammar({
  name: "mdz",

  extras: ($) => [/[ \t]/],

  rules: {
    // Top-level document is a sequence of block-level MDZ extensions.
    // Tree-sitter does not re-implement CommonMark; this grammar is layered.
    source_file: ($) =>
      repeat(
        choice(
          $.block_attr_line,
          $.shorthand_align_line,
          $.container_open,
          $.container_close,
          $.cell_open,
          $.output_open,
          $.include_directive,
          $.inline_directive,
          $._any_line,
        ),
      ),

    // ----- Attribute body -----

    attr_body: ($) => repeat1($._attr_item),

    _attr_item: ($) => choice($.class_item, $.id_item, $.kv_item, $.bool_item),

    class_item: ($) => seq(".", $.ident),
    id_item: ($) => seq("#", $.ident),
    kv_item: ($) => seq($.ident, "=", $._attr_value),
    bool_item: ($) => $.ident,

    _attr_value: ($) => choice($.quoted_string, $.unquoted_value),

    quoted_string: ($) =>
      choice(
        seq('"', /[^"\\\n]*/, '"'),
        seq("'", /[^'\\\n]*/, "'"),
      ),

    unquoted_value: ($) => /[A-Za-z0-9_][A-Za-z0-9_\-.]*/,

    // ----- Block-level markers -----

    block_attr_line: ($) => seq("{", $.attr_body, "}", /[\r\n]/),

    shorthand_align_line: ($) => seq("{", ":", ".", $.ident, "}", /[\r\n]/),

    // ----- Container blocks -----

    container_open: ($) =>
      seq(
        $._colons3,
        optional($.ident),
        optional(seq("{", $.attr_body, "}")),
        /[\r\n]/,
      ),

    container_close: ($) => seq($._colons3, /[\r\n]/),

    _colons3: ($) => /:{3,}/,

    // ----- Cells and outputs -----

    cell_open: ($) =>
      seq(
        "::cell",
        optional(seq("{", $.attr_body, "}")),
        /[\r\n]/,
      ),

    output_open: ($) =>
      seq(
        "::output",
        "{",
        $.attr_body,
        "}",
        /[\r\n]/,
      ),

    // ----- Transclusion -----

    include_directive: ($) =>
      seq(
        "::include",
        "[",
        $.attr_body,
        "]",
        optional(seq("{", $.attr_body, "}")),
        /[\r\n]/,
      ),

    // ----- Generic inline directive -----

    inline_directive: ($) =>
      seq(
        "::",
        $.ident,
        optional(seq("[", /[^\]\n]*/, "]")),
        optional(seq("{", $.attr_body, "}")),
        /[\r\n]/,
      ),

    // ----- Tokens -----

    ident: ($) => /[a-zA-Z][a-zA-Z0-9_\-]*/,

    // Fallback: any line that doesn't match an MDZ directive. Tree-sitter
    // injections should hand these to the markdown grammar.
    _any_line: ($) => /[^\r\n]*[\r\n]/,
  },
});
