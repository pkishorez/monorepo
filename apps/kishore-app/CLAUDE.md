# Claude Code Instructions for kishore-app

## Commands

- **Linting/Type checking**: `pnpm lint` (runs `vp check` -- format + lint + typecheck)
- **Dev server**: `pnpm dev`. Used internally. Do not run it directly. Just ask me for testing with dev.
- **Build**: `pnpm build`

## Code Style

- Always use top-level imports. Only use dynamic `import()` when absolutely necessary.
- Use `import type` / `import { type ... }` for type-only imports wherever possible.
