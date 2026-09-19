# kui-toolkit

## 0.0.2

### Patch Changes

- [#44](https://github.com/pkishorez/monorepo/pull/44) [`7134458`](https://github.com/pkishorez/monorepo/commit/7134458c8c2c2cf08ceb66868b1bdf2445e3c179) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Flows become their own package, `@pkishorez/flow`. A Flow is an append-only Journal of Entries that Participants record at runtime: events, messages and replies, activations with an outcome, waits and resumes, checks, and a close hint. Entries go to an optional Flow Telemetry sink (`FlowTelemetry.layer` forwards them to DevTools, `FlowTelemetry.layerMemory` keeps them for tests and Stories); `projectJournal` derives the swim-lane view and `mergeJournals` combines journals recorded by different clients.

  Breaking changes (this remains a patch release):

  - `@pkishorez/effect-tracer` removes `./flow` and `TraceRecorder.snapshotFlow` / `snapshotFlows`; use `@pkishorez/flow` Journals, Telemetry, and Projections instead.
  - `@pkishorez/lotel` removes `./flow`, `ListFlows`, `GetFlow`, and the flow methods on `TelemetryStore`. `kstack` therefore replaces those procedures in `DevtoolsRpc` with `WriteFlowEntries`, `ListFlowEntries`, and `ClearFlows`; Lotel now stores traces and logs only.
  - `laymos` changes flow story sections from `{ kind: 'flow', flow }` to `{ kind: 'flow', journal }`, replaces the exported `RecordedFlow` schema/type with `Journal`, and no longer derives flows from trace-recorder data.
  - `std-toolkit` changes its exported sync flow contract: `FlowLane` is now a Flow `Participant`, `log` becomes `event`, `level` becomes `severity`, `participantName` / `id` become `name` / `flowId`, message and activation names must be strings, and `activated` takes the name directly.
  - `kui-toolkit` requires `runtime` on `DevToolsPanel`, changes the swim-lane input from the old recorded-flow shape to a Flow `Projection`, and removes `onActivityClick`.
  - `@pkishorez/effect-tracer`, `laymos`, and `std-toolkit` now require `effect@4.0.0-rc.112` instead of `4.0.0-rc.110`; `std-toolkit` also requires `alchemy@2.0.0-beta.76` instead of `2.0.0-beta.72`.

- [`9458de2`](https://github.com/pkishorez/monorepo/commit/9458de2992fb2c447f2c032e203e1ccfecb2d347) Thanks [@pkishorez](https://github.com/pkishorez)! - The Auth Worker's pages are rebuilt on a new kui-toolkit `auth` block, with one width, one loader, and no layout shifts. `/` is now the Home Page: a signed-in User sees every Session on their account and every app they allowed, and can revoke any of them. Revoking an app also revokes its refresh tokens. `/login` only signs in, and every other page sends a signed-out visitor there and back. `CliAuth.layer` takes an optional `version`, and the CLI names itself `<app>/<version>` so its Session is recognisable on the Home Page. When the Auth Worker is down or unreachable, the CLI now fails with `AuthWorkerUnreachable` and a plain message instead of a raw HTTP error. Better Auth errors now redirect to a branded Error Screen at `/error` instead of Better Auth's default page, and unknown paths show a branded Not Found screen.

- [`61be51e`](https://github.com/pkishorez/monorepo/commit/61be51e0282f73c36581caa8470206a868c2572e) Thanks [@pkishorez](https://github.com/pkishorez)! - Add adaptive compact layouts for the Lotel and Laymos workspaces, with a bottom tool bar, drill-down pages, and sheet-based controls below 768px. The DevTools UI server now listens on all interfaces and honours DEVTOOLS_UI_PORT so the app can be opened from a phone.

- [#44](https://github.com/pkishorez/monorepo/pull/44) [`df778b6`](https://github.com/pkishorez/monorepo/commit/df778b696f82514c9d42393c676dbe6fd8f82163) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Add the Monoverse tool: a bird's-eye view of one pnpm monorepo. Add a monorepo, see every package laid out by dependency rank with runtime, dev, peer, and optional connections you can filter, spot dependency cycles, and drill from any package that carries a `laymos.config.json` into Laymos without leaving the canvas. Analysis and the `AnalyzeMonorepo` RPC live inside DevTools; the complete explorer UI and its data types live in the `kui-toolkit` Monoverse block.

- [#44](https://github.com/pkishorez/monorepo/pull/44) [`df778b6`](https://github.com/pkishorez/monorepo/commit/df778b696f82514c9d42393c676dbe6fd8f82163) Thanks [@kishorenuma](https://github.com/kishorenuma)! - Show unchanged modules by default, hide module connections initially, and use compact lowercase monospace navigation controls across the Laymos and Monoverse workspaces.

- [`dff4ebc`](https://github.com/pkishorez/monorepo/commit/dff4ebcc9c6dfc7da4f14491513150b80a00e107) Thanks [@pkishorez](https://github.com/pkishorez)! - Style document scrollbars with a thin, theme-aware thumb and avoid reserving scrollbar space when it is not needed.
- Updated dependencies [[`c0dc89f`](https://github.com/pkishorez/monorepo/commit/c0dc89f3899267d87b239694d63cbbda880cb646), [`bd18d2f`](https://github.com/pkishorez/monorepo/commit/bd18d2f8f99594de5acb47d0bba69517a6db9fe0), [`7134458`](https://github.com/pkishorez/monorepo/commit/7134458c8c2c2cf08ceb66868b1bdf2445e3c179), [`d7a9f63`](https://github.com/pkishorez/monorepo/commit/d7a9f63b89b3ad7b047fed220cc3d9e96dae1686), [`af17702`](https://github.com/pkishorez/monorepo/commit/af177027258ca535a6b085ede9fc967b73d4474a)]:
  - use-effect-ts@0.0.11
  - @pkishorez/lotel@0.0.10
  - laymos@0.0.10
  - @pkishorez/flow@0.0.10
  - @pkishorez/effect-tracer@0.0.10
  - std-toolkit@0.0.10

## 0.0.1

### Patch Changes

- [`7b8db1e`](https://github.com/pkishorez/monorepo/commit/7b8db1e602fb5def113ace65e70bf65688c5e215) Thanks [@pkishorez](https://github.com/pkishorez)! - Publish the former private frontend package as kui-toolkit, with source
  exports for React components, blocks, forms, hooks, utilities, and styles.
  Register Tailwind sources from the installed package, declare consumer
  dependencies and compatible peers, and document TanStack Start integration.

## 0.0.3

### Patch Changes

- Improve ui. Fix edge logic.

## 0.0.2

### Patch Changes

- Rebuild the feature model so selecting any feature renders a single-rooted, top-down cone derived from the real import graph, instead of an inferred pile of disconnected roots.

## 0.0.1

### Patch Changes

- Bundle typescript as well, for depcruise to work properly. Fix ui for frontend.
