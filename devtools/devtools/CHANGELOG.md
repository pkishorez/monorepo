# @kestack/devtools

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.4
  - laymos@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1), [`71c93f3`](https://github.com/pkishorez/monorepo/commit/71c93f3e7d8c13bb4845fefc70cfb28c58d1d6e1)]:
  - laymos@0.0.14
  - @kestack/std-toolkit@0.0.3

## 0.0.13

### Patch Changes

- Updated dependencies []:
  - @kestack/std-toolkit@0.0.2
  - laymos@0.0.13

## 0.0.12

### Patch Changes

- [`83f6125`](https://github.com/pkishorez/monorepo/commit/83f6125efe19c5d990bf115b560c79bc5300abe6) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: `@kestack/lotel` is now part of `@kestack/devtools`, and so are the DevTools views that lived in the private `@devtools/ui`. Import Lotel from `@kestack/devtools/lotel`, `@kestack/devtools/lotel/rpc` and `@kestack/devtools/lotel/telemetry` instead of `@kestack/lotel`, `@kestack/lotel/rpc` and `@kestack/lotel/telemetry`. `@kestack/lotel/sqlite` is gone: `sqliteTelemetryStoreLayer` comes from `@kestack/devtools/lotel`. The Lotel subpaths ship built JavaScript with types.

  `@kestack/devtools/rpc` is no longer exported: only DevTools' own server, browser UI and Client Commands use it.

  Lotel's Span and Log Records drop `flowId` and `participantName`; records stored with them still read.

- [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9) Thanks [@pkishorez](https://github.com/pkishorez)! - Breaking: DevTools now hosts two Tools, Lotel and Monoverse, with Laymos opened inside Monoverse. The Flow Tool, its `/flow` route, `list-flows`, `get-flow` and `devtools snapshot` are removed, and so is the `/laymos` route. In `@kestack/devtools/rpc`, `NotPnpmWorkspaceError` is now `NoPackageJsonError`, and `FlowEntryEntitySchema`, `RegistryToolSchema` and `ProjectEntryEntitySchema` are gone.

  Monoverse reads npm, yarn, bun and pnpm monorepos, and a single package too (including a pnpm one whose `pnpm-workspace.yaml` lists no `packages`), and draws Packages the way Laymos draws a Project, with changed, added and deleted ones marked. The Stories tab shows the new Laymos Stories, with recordings for browser Proofs, and only reloads the Proof files that changed.

- Updated dependencies [[`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9), [`971ddea`](https://github.com/pkishorez/monorepo/commit/971ddead3dd5c7b16ce1466d878535047e9406d9)]:
  - laymos@0.0.12
  - @kestack/std-toolkit@0.0.1
