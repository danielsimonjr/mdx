# Alignment Conformance Tests

This directory contains test files for MDX v1.1 alignment feature conformance.

## Test Files

| File | Description |
|------|-------------|
| `01-basic-alignment.md` | Basic left, center, right, justify alignment |
| `02-headings.md` | Alignment applied to headings |
| `03-lists.md` | Alignment applied to lists |
| `04-blockquotes.md` | Alignment applied to blockquotes |
| `05-directives.md` | Alignment with MDX directives |
| `06-containers.md` | Directive block containers |
| `07-precedence.md` | Attribute precedence rules |
| `08-combined-attributes.md` | Multiple attributes combined |
| `09-malformed.md` | Malformed syntax handling |
| `10-backward-compat.md` | Documents without alignment |

## Running Tests

These files are raw Markdown content for testing parsers. To create MDX
documents from them, wrap each in a valid MDX archive with appropriate
manifest.json.

## Expected Behavior

Conforming renderers should:

1. Apply alignment classes to block elements
2. Generate CSS classes (not inline styles) when possible
3. Handle precedence: inline > block > container
4. Ignore malformed attribute blocks gracefully
5. Render documents without alignment using default left alignment
