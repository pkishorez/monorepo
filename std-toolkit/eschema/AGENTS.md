# AGENTS.md - Coding Guidelines for @std-toolkit/eschema

## Commands
- **Verify**: `pnpm lint` (type checking) and `pnpm test:run` (run all tests)
- **Single test**: `pnpm vitest run <path>` (e.g., `pnpm vitest run tests/eschema.test.ts`)
- **Watch mode**: `pnpm dev` (build) or `pnpm test:watch` (tests)
- **NEVER run**: `pnpm build` - use `pnpm lint` for verification instead

## Code Style

### Imports
- Use `.js` extensions for local imports (e.g., `from './types.js'`)
- Group: external deps, then local imports
- Use named imports from 'valibot' as `* as v` or specific imports from 'effect', 'vitest'

### Types & Naming
- TypeScript strict mode with `exactOptionalPropertyTypes: true`
- Generic types use descriptive names: `TEvolutions`, `TOptions`, `S extends Schema`
- Types prefixed with `T` or descriptive names (e.g., `TypeFromSchema`, `LatestEvolution`)
- Private fields use `#` syntax (e.g., `#evolutions`)
- Type utilities use JSDoc with `@template`, `@example`, `@param`, `@returns`

### Error Handling
- Throw descriptive `Error` with messages for invalid states
- No async validations - throw error if encountered
- Use `Effect.runSync()` for synchronous Effect execution in tests

### Testing
- Vitest with globals enabled, setup file at `./tests/setup.ts`
- Keep tests essential and minimal - avoid redundant coverage
- Type-level tests should be exhaustive yet concise
