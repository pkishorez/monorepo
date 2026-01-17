# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Overview

This is `@monorepo/eschema`, a TypeScript library for schema evolution using Effect.TS. The package provides a builder pattern for creating versioned schemas that can evolve over time while maintaining backward compatibility.

## Development Commands

```bash
# Type checking and linting
pnpm lint

# Development with watch mode
pnpm dev

# Run tests
pnpm test

# Run tests once
pnpm test:run

# Watch tests
pnpm test:watch
```

**IMPORTANT**: Do NOT run `pnpm build`. For verification, only use `pnpm lint` and `pnpm test:run`.

## Project Structure

```
src/
  eschema.ts           # Main ESchema class and Builder implementation  
  types.ts             # Type definitions and utilities
  util.ts              # Runtime utility functions
  play.ts              # Development playground file
tests/                 # Test files (referenced in vitest.config.ts)
  types.test.ts        # Type-level tests
  util.test.ts         # Runtime utility function tests  
  version-exclusion.test.ts  # Version exclusion feature tests
  setup.ts             # Test setup configuration
dist/                  # TypeScript compilation output
```

## Architecture

The core architecture follows a builder pattern with these key components:

### ESchema Class

- Entry point for creating versioned schemas
- Static `make()` method creates initial schema with version
- Returns a `Builder` instance for chaining evolutions

### Builder Class

- Manages an array of schema evolutions
- `evolve()` method adds new schema versions
- Uses TypeScript generics to maintain type safety across evolutions
- Immutable pattern - each evolution returns a new Builder instance

### Evolution Interface

- Represents a single schema version
- Contains `version` (string) and `evolution` (Effect Schema)  
- Generic types ensure type safety: `Evolution<V, S>`

## Dependencies

- **Effect.TS**: Functional programming library providing the Schema system
- **@standard-schema/spec**: Standard schema specification compliance
- **Vitest**: Testing framework with globals enabled and setup files
- **TypeScript**: Strict mode with exact optional property types

## Type System

The package uses advanced TypeScript features:

- Generic constraints with `extends` keyword
- Tuple type manipulation with spread operators `[...Evolutions, E]`
- Schema type inference from Effect.js
- Strict null checks and exact optional property types

## Testing Setup

- Uses Vitest with globals enabled
- Test setup file at `./tests/setup.ts` (ensure this file exists when adding tests)
- All tests are organized in the `tests/` directory for better organization
- Configuration allows for schema evolution testing

### Testing Philosophy

- Keep tests **essential and minimal** - only test what truly matters
- Type-level tests should be **exhaustive yet concise** - cover core functionality without redundancy
- Focus on testing the public API and critical type inference
- Avoid overly complex integration scenarios unless they reveal genuine edge cases

### Type Checking

- **ALWAYS run `pnpm lint` when asked to "fix types"** - this runs TypeScript type checking to identify specific issues
- Address type errors systematically based on the compiler output
- Ensure all type constraints and generic relationships are properly maintained

