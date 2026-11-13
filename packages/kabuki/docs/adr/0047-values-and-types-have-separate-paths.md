# Values and types have separate paths

Kabuki had grown 21 import paths. Each folder in a Part was a path of its own, giving its value and every type that went with it, so `core/actor`, `core/data`, `react/view`, `routing/page`, `routing/capabilities` and the rest each repeated what the Part's path gave and added its types. Most were imported by a handful of files for one or two types, and four by nothing outside Kabuki. An app saw the folder layout as its API, and every folder moved was a breaking change.

Each Part now has one path for its values and one for its types. `@kestack/kabuki`, `@kestack/kabuki/react`, `@kestack/kabuki/routing` and `@kestack/kabuki/start` give values only: the namespaces, components, hooks and Capabilities an app is made of. `@kestack/kabuki/types`, `@kestack/kabuki/react/types`, `@kestack/kabuki/routing/types` and `@kestack/kabuki/start/types` give types only, for code that has to name one. A Part's `index.ts` exports no type, and its `types.ts` beside it exports nothing else.

A path beyond those exists only when its code must load apart: `@kestack/kabuki/start/server`, which runs on the server alone; `@kestack/kabuki/start/vite`, which runs in the Vite config alone and now holds the platform adapters, `cloudflare()` and `nitro()`; and `@kestack/kabuki/start/client`, which only the browser entry the plugin writes imports. Each platform's `serve`, which the server entry the plugin writes imports, is on `/start/server`. The browser's and TanStack Router's Adapters, `browser()` and `tanstack()`, and the scroll hooks, `useElementScrollRestoration` and `useKeepScrollAnchor`, are named exports of `@kestack/kabuki/routing`, not members of `Router`: a bundler drops a named export no one imports, but never a member of an object, so on `Router` every routed app would carry both Adapters.

## Considered Options

- **Types beside values at each Part's path**: rejected. An app's imports would list types it never wanted among the values it is made of, and the values path would be the place every new type leaks into.
- **A path per folder, as before**: rejected. The folder layout is Kabuki's own, and it should move without breaking an app.
- **The Adapters and scroll hooks on `Router`**: rejected. Measured with Vite and esbuild, an app using only `Router.define` carried both Adapters and both hooks, about 2 KB minified.
- **No `/start/client` path, the plugin importing the file by where it is on disk**: rejected. It breaks under pnpm's links and other bundlers, for one path no app imports.

## Consequences

- A value whose name is also a type, as `Runtime`, `Snapshot`, `Navigation` or `Loading`, still gives that type from its values path, as TypeScript joins them.
- A type a package's declarations reach, as `DefinedOf` for an Actor built in a published package, has to be on a `/types` path, or that package's build fails with a type that cannot be named.
- Inside Kabuki, a Part imports another Part's types through that Part's inner folders, as before; `types.ts` is for apps.
- Only Kabuki follows this rule for now. The other packages and `docs/readme-conventions.md` may take it later.
