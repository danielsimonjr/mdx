# Contributing to MDX Format

Thank you for your interest in contributing to the MDX Format specification and implementations.

## Ways to Contribute

### Reporting Issues

- **Specification Clarifications** - If something in the spec is unclear or ambiguous
- **Bug Reports** - Issues with reference implementations or viewer
- **Feature Requests** - Suggestions for new capabilities

### Proposing Specification Changes

1. Open an issue describing the proposed change
2. Include rationale and use cases
3. Consider backward compatibility implications
4. If accepted, submit a PR with spec updates

### Submitting Code

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run any applicable tests
5. Submit a pull request

## Specification Guidelines

When proposing spec changes:

- Use RFC 2119 terminology (MUST, SHOULD, MAY, etc.)
- Maintain backward compatibility where possible
- Consider graceful degradation for new features
- Update the version number appropriately (SemVer)
- Include examples in the specification

## Implementation Guidelines

Reference implementations should:

- Follow the specification exactly
- Include comprehensive error handling
- Provide clear API documentation
- Support both creation and reading of MDX files
- Handle edge cases gracefully

### TypeScript Implementation

- Use strict TypeScript with full type annotations
- Document public methods with JSDoc
- Handle both browser and Node.js environments where applicable

### Python Implementation

- Support Python 3.8+
- Use type hints
- Prefer standard library where possible
- Follow PEP 8 style guidelines

## Code Style

- Use consistent formatting within each implementation
- Write clear, self-documenting code
- Add comments for complex logic
- Keep functions focused and testable

## Pull Request Process

1. Update documentation if needed
2. Add yourself to contributors if this is your first contribution
3. Ensure CI checks pass
4. Request review from maintainers

## Questions?

Open a Discussion or Issue if you have questions about contributing.
