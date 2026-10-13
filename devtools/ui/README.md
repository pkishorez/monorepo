# @devtools/ui

The UI only the DevTools show: the trace viewer, Laymos's architecture explorer and the monorepo map. Private: @kestack/devtools bundles it.

## Big picture

These views used to live in `@kestack/ui-toolkit`, but no app other than
DevTools shows them. They moved here when ui-toolkit became
`@kestack/web-platform`, so web-platform carries only what any web app needs
([ADR 0003](../../docs/adr/0003-web-toolkit-and-the-gate.md)).

The package is never published. `@kestack/devtools` lists it as a
devDependency and bundles it into its browser UI at build time, so nothing
installs it. It is built on `@kestack/web-platform` for components and theme,
and reads its data shapes from `@kestack/lotel`, `@kestack/effect-tracer`
and `laymos`.

The package ships TypeScript source. Each folder in `src/` is one view, with
its own subpath:

- `otel-trace-viewer` (and `otel-trace-viewer/*` for its trace model and
  presentation): the Lotel Tool's trace list, waterfall and span inspection.
- `laymos`: Laymos's Laymo (the architecture as a space of cards), its Stories canvas and the File list, shown as Embedded Laymos in Monoverse.
- `monoverse`: the Monoverse Tool's map of a monorepo or a single package.

## Usage

### Use a view in DevTools

DevTools imports a view by its subpath, as
`devtools/devtools/src/ui/lotel/viewer` does.

```tsx
import { TraceDock } from '@devtools/ui/otel-trace-viewer';
import type { TraceGroup } from '@devtools/ui/otel-trace-viewer/trace-model';
```

- Add `"@devtools/ui": "workspace:*"` to `devDependencies`, never
  `dependencies`: the published `@kestack/devtools` must not depend on it.
- `pnpm --filter @kestack/devtools build` bundles what DevTools imports.

### Work on a view in isolation

Every view has React Cosmos fixtures (`*.fixture.tsx`) next to it.

```sh
pnpm --filter @devtools/ui dev   # React Cosmos on http://localhost:20006
pnpm --filter @devtools/ui test
pnpm --filter @devtools/ui lint
```

- `src/cosmos.decorator.tsx` wraps every fixture in web-platform's theme.
