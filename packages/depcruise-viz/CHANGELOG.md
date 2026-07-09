# depcruise-viz

## 0.0.10

### Patch Changes

- Stop cruise from following imports into `node_modules`. The programmatic `cruise()` API applies no default `doNotFollow`, so on large apps it traversed and parsed the entire transitive `node_modules` graph — making `files`/`lint`/`deps` extremely slow (~10× on a Next.js app). Now bounded to the package's own source, matching the analysis scope. Output is unchanged.

## 0.0.9

### Patch Changes

- [`b6c8daf`](https://github.com/pkishorez/monorepo/commit/b6c8daf6814a806303062deafeb290fe830c30e7) Thanks [@pkishorez](https://github.com/pkishorez)! - Improve speed, by spawning a sub process for cruise. Add 2 more sub commands for depcruise-lint. Improve ui.

## 0.0.8

### Patch Changes

- [`a95b573`](https://github.com/pkishorez/monorepo/commit/a95b57378f567b3d990e68127ea55e5a4967853e) Thanks [@pkishorez](https://github.com/pkishorez)! - Big rewrite! Now, layers are more like a graph. Not stacks. No more features. Just modules. Added ability to configure rules at module level. And complete overhaul of the frontend viz!

## 0.0.7

### Patch Changes

- [`5b9a4ab`](https://github.com/pkishorez/monorepo/commit/5b9a4abf8a6250e7005d1b5df7abed584e59624d) Thanks [@pkishorez](https://github.com/pkishorez)! - Improve ui. For devtools, only open when --open flag is present.

## 0.0.6

### Patch Changes

- Improve ui. Fix edge logic.

## 0.0.5

### Patch Changes

- Rebuild the feature model so selecting any feature renders a single-rooted, top-down cone derived from the real import graph, instead of an inferred pile of disconnected roots.

## 0.0.4

### Patch Changes

- Bundle typescript as well, for depcruise to work properly. Fix ui for frontend.

## 0.0.3

### Patch Changes

- Fix CLI crash with `Cannot find module 'ioredis'` by importing `NodeRuntime` and `NodeServices` from their `@effect/platform-node` subpaths instead of the barrel, which eagerly re-exports `NodeRedis` and forces resolution of the unused `ioredis` peer dependency.

## 0.0.2

### Patch Changes

- [#12](https://github.com/pkishorez/monorepo/pull/12) [`36870e3`](https://github.com/pkishorez/monorepo/commit/36870e3b0cb689461a2a44968259cf06ad7efa79) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Add @tanstack/intent agent skills (author-architecture-config, enforce-boundaries, programmatic-analysis) and publish them with the package.

## 0.0.1

### Patch Changes

- [`2a05d0a`](https://github.com/pkishorez/monorepo/commit/2a05d0aadf718192038336c960338e6584475a05) Thanks [@pkishorez](https://github.com/pkishorez)! - Initial release.
  - **depcruise-viz**: dependency-graph visualizer built on dependency-cruiser output.
  - **@kishorez/devtools**: local devtools RPC server for inspecting a project's dependency graph.
  - **@kishorez/lotel**: local OpenTelemetry server for development (internal/private — versioned but not published to npm).
