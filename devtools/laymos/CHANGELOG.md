# laymos

## 0.0.4

### Patch Changes

- [`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin `@effect/platform-node-shared` as a direct exact dependency. `@effect/platform-node@4.0.0-beta.102` depends on it via a caret range, so npm consumers resolved the `4.0.0-rc.*` build, whose `effect` peer nested `effect@4.0.0-rc.*` next to the beta platform-node and crashed imports (`ERR_MODULE_NOT_FOUND` on `effect/dist/unstable/http/Multipasta/Node.js`). The direct pin keeps the whole tree on `4.0.0-beta.102`.

## 0.0.3

### Patch Changes

- [`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin the `effect` peer dependency (and other registry peers) to exact versions. The previous `^4.0.0-beta.102` range also matched `4.0.0-rc.*` prereleases, so fresh installs (e.g. `npx laymos`) resolved an incompatible `effect` build and crashed with `ERR_MODULE_NOT_FOUND`.

- Updated dependencies [[`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e)]:
  - @pkishorez/effect-tracer@0.0.2

## 0.0.2

### Patch Changes

- [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4) Thanks [@pkishorez](https://github.com/pkishorez)! - This release rebuilds Laymos wholesale.

  **Architecture lives in `laymos.config.json`.** The package ships `schema.json`,
  so `"$schema": "https://unpkg.com/laymos/schema.json"` gives you autocomplete
  and validation in the editor with no package dependency. Paths resolve relative
  to the config file.

  Declare `layers`, then `modules` keyed by canonical path. A module's `kind` is
  `normal` (the default), `shared`, or `entry`, and `subpaths` names directories
  whose `index.ts` becomes an extra public door for tree shaking. `layerGraphs`
  groups named rule sets mapping each layer to the layers it may depend on —
  default-deny, transitive, and required to stay acyclic.

  **Three commands.**

  ```sh
  laymos lint              # every rule; or `lint layers` / `lint modules`
  laymos inspect module src/db    # also: project | layer <name> | file <path>
  laymos stories -c 16     # run the Story tree concurrently
  ```

  `lint modules` covers entry points, public boundaries, cycles, and unused Shared
  Modules, and prints Normal/Shared/Entry totals. Every `inspect` subcommand takes
  `--json` for stable tool output, and `inspect module` reports the configured
  kind, the source shape, and the observed kind separately. Exit codes: `1` for
  violations, `2` for a bad config or failed analysis.

  **Stories are executable questions.** A Story is a title plus questions, each
  with an `answer` and an Effect `proof`:

  ```ts
  Story.make('Sync', [
    Story.question('Does a write reach the server?', {
      answer: 'Yes, once the batch flushes.',
      proof: Effect.gen(function* () { ... }),
    }),
  ]);
  ```

  `Story.group` nests them, and `Story.trace` and `Story.flow` attach recorded
  Effect traces and flows to the report. `laymos stories` runs the whole tree
  concurrently with a live progress line and a per-question verdict tree.

  **Exports.** `laymos` gives you `analyzeProject`, `loadModuleSource`,
  `inspectProject`, `inspectLayer`, `inspectFile`, `inspectModule`,
  `getStoryTree`, `planStories`, and `runStories`, plus the tagged errors. Browser
  and RPC code takes contracts from `laymos/architecture-analysis-schema` and
  `laymos/story/schema` without pulling in Node.

  Dependency extraction now runs on `oxc-parser` and `oxc-resolver`. `bin` is
  `bin/laymos.mjs`, so the binary links without a prior build. Requires
  `effect@^4.0.0-beta.102`.

- Updated dependencies [[`4be44ed`](https://github.com/pkishorez/monorepo/commit/4be44ed7294438f8c08bd00124b8e134b91971a6)]:
  - @pkishorez/effect-tracer@0.0.1
