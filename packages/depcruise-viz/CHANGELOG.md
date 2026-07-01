# depcruise-viz

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
