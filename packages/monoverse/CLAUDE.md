# Claude Code Instructions

**Update this file when you discover new patterns or best practices.**

## Commands

- `pnpm lint` - type check
- `pnpm test` - run tests

## Testing

- Tests live in `__tests__` folders
- Use `it()` for sync tests, `it.effect()` only for Effects
- Use `Effect.flip` to test errors (not `Effect.either`)

## Patterns

- `Data.TaggedError` for errors, include `cause: unknown` when wrapping external failures
- All fallible operations return `Effect`, not `Either`
- One file per API endpoint in `src/core/fetch/`

## Types

- Union types over enums (`'a' | 'b'` not `enum { A, B }`)
- `PascalCase` for types, suffix errors with `Error`
- Minimal exports; use `index.ts` as public API

## Comments

- Avoid comments; code should be self-explanatory
- Keep comments only when they communicate intent that cannot be expressed through code (e.g., format specifications)
