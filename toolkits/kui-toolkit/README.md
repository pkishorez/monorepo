# kui-toolkit

Shared React UI components, blocks, forms, hooks, and styles. Published as ESM
TypeScript/TSX source: the consuming application's Vite build compiles the code.
There is no library build step. Supported setup: React 19, Tailwind CSS 4, and
Vite with the React plugin, including TanStack Start.

## Install

```sh
pnpm add kui-toolkit react react-dom
pnpm add -D tailwindcss @tailwindcss/vite
```

## TanStack Start

Add the toolkit to `ssr.noExternal` in the application's existing Vite config.
Keep any existing plugins and SSR settings:

```ts
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react()],
  ssr: { noExternal: ['kui-toolkit'] },
});
```

Import the stylesheet below from your application's root stylesheet, and load
that stylesheet in your root route using Start's stylesheet setup:

```css
@import 'kui-toolkit/styles/global.css';
/* Optional font; the toolkit does not require it. */
@import 'kui-toolkit/styles/font-inter.css';
```

`global.css` includes Tailwind, animations, typography, theme tokens, syntax
highlighting styles, and source registration for the toolkit's utility classes.
Consumers do not need a path into this repository or a manual `@source` pointing
at `node_modules`. The global stylesheet also applies Tailwind's base reset.

If your app already configures Tailwind and its own theme, import only what you
need alongside your existing Tailwind setup:

```css
@import 'kui-toolkit/styles/sources.css';
@import 'kui-toolkit/styles/theme.css';
@import 'kui-toolkit/styles/shiki.css';
```

For client-only Vite apps, use the React and Tailwind plugins; `ssr.noExternal`
is only needed when processing the package for server rendering. The package's
own Vite config is for its component playground and is not loaded by consumers.

## Imports

```tsx
import { Button } from 'kui-toolkit/components/ui/button';
import { cn } from 'kui-toolkit/utils';

export function SaveButton() {
  return <Button className={cn('w-full')}>Save</Button>;
}
```

Use individual subpaths; there is no root barrel importing all blocks.

| Import                            | Contents                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `kui-toolkit/components/ui/*`     | Buttons, dialogs, inputs, tables, and other UI primitives |
| `kui-toolkit/components/blocks/*` | Composed viewers, diagrams, and interactive blocks        |
| `kui-toolkit/form`                | TanStack Form integration and field components            |
| `kui-toolkit/hooks/*`             | Shared React hooks                                        |
| `kui-toolkit/utils`               | Class-name utilities                                      |
| `kui-toolkit/lib/*`               | Shared utilities, including `lib/shadow-dom`              |
| `kui-toolkit/lucide`              | Icon exports                                              |
| `kui-toolkit/motion`              | Animation exports                                         |
| `kui-toolkit/styles/*`            | CSS themes, fonts, and source registration                |

Specialized blocks have optional peers. Install the peers needed by the blocks
you import; ordinary UI primitives do not require the Effect or tracing stack.

| Block                | Additional direct peers                        |
| -------------------- | ---------------------------------------------- |
| `er-diagram`         | `std-toolkit` (snapshot types)                 |
| `flow-swimlane`      | `@pkishorez/effect-tracer`                     |
| `devtools-panel`     | `@pkishorez/effect-tracer`, `@pkishorez/lotel` |
| `otel-trace-viewer`  | `@pkishorez/lotel` (telemetry types)           |
| `diff-viewer`        | `laymos` (diff types)                          |
| `laymos`             | `laymos`, `effect`, `use-effect-ts`            |
| `std-toolkit-studio` | `std-toolkit`, `effect`, `use-effect-ts`       |

Those packages can have additional peer requirements of their own. Type-only
peers are needed when TypeScript checks the imported source. Use TypeScript's
`moduleResolution: "bundler"` and `jsx: "react-jsx"`, with React types installed.
Because this package exports source, your TypeScript settings also apply to it;
`skipLibCheck` does not skip `.ts` and `.tsx` files. Direct execution in Node
without a TSX-aware bundler is not supported.

## Release

From the monorepo root:

```sh
pnpm --filter kui-toolkit lint
pnpm --filter kui-toolkit pack --pack-destination /tmp/kui-toolkit-release
```

The package participates in the repository's Changesets release workflow.
`pnpm pack` and `pnpm publish` resolve catalog and workspace versions in the
published manifest. Publish with pnpm from the workspace, not by copying its
unprocessed package.json to a separate directory. Required optional-peer
versions must be published before consumers can use their associated blocks.

## License

MIT. The UI primitives originated from the shadcn Vega/Base UI template.
