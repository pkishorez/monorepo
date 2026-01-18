# Update Package README

Update the README.md for a package following the unified structure used across this monorepo.

## Arguments

- `$ARGUMENTS` - Path to the package directory (e.g., `packages/monoverse`, `std-toolkit/db-sqlite`)

## Instructions

1. **Explore the package** to understand:
   - What the package does (read existing README, package.json, source files)
   - Main exports and API surface
   - Dependencies and prerequisites
   - Any configuration options
   - Common usage patterns

2. **Update the README.md** following this unified structure:

```markdown
# package-name

One-liner description of what the package does.

## Prerequisites

- List runtime dependencies or required tools
- Link to external docs where helpful

## Installation

\`\`\`bash
npm install package-name
\`\`\`

## Getting Started

Show a minimal working example that demonstrates the core value proposition.
Keep it short - just enough to get someone productive.

## API / Commands / Operations

| Method/Command | Description |
|----------------|-------------|
| `method1()` | Brief description |
| `method2()` | Brief description |

---

### method1

Detailed explanation with code example.

\`\`\`typescript
// Code example
\`\`\`

---

### method2

Detailed explanation with code example.

\`\`\`typescript
// Code example
\`\`\`

## [Additional Sections]

Add package-specific sections as needed:
- Adapters (for packages with multiple backends)
- Configuration (for configurable packages)
- Schema Evolution (for eschema)
- Error Handling (if complex error types)
- Integrations (for packages that work with external tools)

## Gotchas

- **Issue 1**: Explanation and workaround
- **Issue 2**: Explanation and workaround
- **Issue 3**: Explanation and workaround

## License

MIT
```

3. **Style guidelines**:
   - Use `typescript` for code blocks (not `ts`)
   - Keep descriptions concise - prefer showing over telling
   - Use tables for API overviews, then detailed sections below
   - Include realistic, copy-paste-ready code examples
   - Add horizontal rules (`---`) between detailed API sections
   - Gotchas should highlight non-obvious behavior or common mistakes

4. **Do NOT**:
   - Add badges or shields
   - Include changelog or version history
   - Add contributing guidelines (that goes in CONTRIBUTING.md)
   - Over-explain obvious things

## Example Usage

```
/update-package-readme std-toolkit/eschema
/update-package-readme packages/monoverse
```
