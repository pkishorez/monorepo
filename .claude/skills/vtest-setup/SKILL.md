---
name: vtest-setup
description: Wires a package in the private-monorepo to generate live documentation via @monorepo/vtest. Installs the dep, writes vitest.docs.config.ts, adds a `docs` script, exposes the generated report through package.json exports, scaffolds the vtest/ folder, and registers a vp staged rule so the report stays fresh on commit. Use when the user wants to set up vtest docs for a package, run /vtest-setup, or asks how to start generating vtest reports in a package that doesn't have them yet.
---

# vtest-setup

User-invoked only. Run inside a target package directory under `packages/` or `apps/`. Bail with a clear message if run from the monorepo root or anywhere else.

## Preflight

1. Verify `cwd/package.json` exists. If not, abort: "run from inside a package directory (packages/<name> or apps/<name>)."
2. Verify the package depends on `vitest` (any dep field). If not, abort: "add vitest to this package first (`pnpm add -D vitest`), then re-run."
3. Verify `vitest.docs.config.ts` does NOT already exist. If it does, abort: "this package is already set up — run /vtest-docs instead."

## Actions (in order)

### 1. Add devDependency

Edit `package.json` to add `"@monorepo/vtest": "workspace:*"` under `devDependencies`. Preserve alphabetical order if other entries are sorted.

### 2. Write `vitest.docs.config.ts` at package root

```ts
import { defineConfig } from 'vitest/config';

import { VTestReporter } from '@monorepo/vtest/reporter';

export default defineConfig({
  test: {
    include: ['vtest/**/*.test.ts'],
    includeTaskLocation: true,
    reporters: ['default', new VTestReporter({ root: 'vtest' })],
  },
});
```

Do NOT specify `outFile` — the package default is `vtest/report.json`.

### 3. Update `package.json`

- Add to `scripts`: `"docs": "vitest run --config vitest.docs.config.ts"`. Place near other test/lint scripts.
- Add to `exports`: `"./vtest-report": "./vtest/report.json"`. Append after existing entries (don't break order).

### 4. Create `vtest/home.md`

Read `name` and `description` from `package.json`. Write a placeholder:

```md
# {name}

{description or 'TODO: one-line description of this package.'}
```

Do not write a `vtest/.gitignore` — `report.json` must be committed.

### 5. Register pre-commit regeneration

Edit `/Users/kishorepolamarasetty/CAREER/MINE/private-monorepo/vite.config.ts`. Inside `staged: { ... }`, append (preserving existing entries):

```ts
'<rel-path>/{src,vtest}/**': 'pnpm --filter <pkg-name> docs',
```

Where `<rel-path>` is the package path relative to monorepo root (e.g. `packages/json-expr`) and `<pkg-name>` is `name` from `package.json` (e.g. `@monorepo/json-expr`).

If a similar entry already exists for this package, leave it alone.

### 6. Install

Run `pnpm install` from the monorepo root.

## Postflight

Print a summary:

- files created/modified (paths)
- next step: "run /vtest-docs in this directory to scaffold the docs tree"
- consumer hint (one-time): the report is now importable as
  `import report from '<pkg-name>/vtest-report' with { type: 'json' }`
  and the renderer is `import { VTestDocs } from '@monorepo/frontend/components/blocks/vtest';`

## Reference files

- `@monorepo/vtest` source: `packages/vtest/src/`
- Worked example: `packages/frontend/vitest.docs.config.ts`, `packages/frontend/vtest/`
- Doc style guide (used by /vtest-docs, not here): `packages/frontend/src/components/blocks/vtest/PAGE-ANATOMY.md`
