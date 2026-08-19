# @pkishorez/devtools

## 0.0.5

### Patch Changes

- Updated dependencies [[`1581578`](https://github.com/pkishorez/monorepo/commit/15815780159aabe6e2f2347d0b5215338715422c)]:
  - laymos@0.0.5
  - std-toolkit@0.0.5
  - @pkishorez/lotel@0.0.5

## 0.0.4

### Patch Changes

- [`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin `@effect/platform-node-shared` as a direct exact dependency. `@effect/platform-node@4.0.0-beta.102` depends on it via a caret range, so npm consumers resolved the `4.0.0-rc.*` build, whose `effect` peer nested `effect@4.0.0-rc.*` next to the beta platform-node and crashed imports (`ERR_MODULE_NOT_FOUND` on `effect/dist/unstable/http/Multipasta/Node.js`). The direct pin keeps the whole tree on `4.0.0-beta.102`.

- Updated dependencies [[`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52)]:
  - laymos@0.0.4
  - std-toolkit@0.0.5
  - @pkishorez/lotel@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [[`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e)]:
  - laymos@0.0.3
  - std-toolkit@0.0.4
  - @pkishorez/lotel@0.0.3

## 0.0.2

### Patch Changes

- [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4) Thanks [@pkishorez](https://github.com/pkishorez)! - This release replaces the DevTools RPC surface wholesale.

  `DevtoolsRpc` is now the tool procedures merged with lotel's `LotelRpc`, served
  from the single `@pkishorez/devtools/rpc` export.

  **Architecture tools.** `AnalyzeLaymosProject` returns typed layer and module
  analysis for a project path, `GetLaymosModuleSource` returns a module's source
  snapshot with file navigation, `GetLaymosStories` returns the story tree, and
  the streaming `RunLaymosStories` runs it — optionally scoped — reporting
  per-story progress as it goes.

  **Telemetry** comes straight from `@pkishorez/lotel/rpc`: `SaveSpans`,
  `InsertLogs`, `ListSpans`, `ListLogs`, `ListFlows`, `GetTrace`, `GetFlow`, and
  `ClearTelemetry`. The `devtools get-trace <trace-id>` subcommand is backed by
  `GetTrace`. OTLP ingest is `/v1/traces` and `/v1/logs`; metrics are no longer
  collected.

  **Failures are tagged**, so callers can tell a bad path from a bad config from a
  failed analysis: `InvalidProjectPath`, `ConfigReadError`, `ConfigParseError`,
  `ConfigSchemaError`, `ConfigValidationError`, `SourceAnalysisError`,
  `ModuleSourceNotFoundError`, `ModuleSourceReadError`, and
  `StoriesUnavailableError`.

- Updated dependencies [[`8c24af2`](https://github.com/pkishorez/monorepo/commit/8c24af227c83ab532ff0865cbff44a9b5db3d34e), [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4), [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4)]:
  - std-toolkit@0.0.3
  - laymos@0.0.2
  - @pkishorez/lotel@0.0.2

## 0.0.1

### Patch Changes

- [`4d517e2`](https://github.com/pkishorez/monorepo/commit/4d517e221e487307befdecf2066cabb7a510fb8e) Thanks [@pkishorez](https://github.com/pkishorez)! - Remove the retired depcruise-viz analyzer and RPC surface in favor of Laymos.

- Updated dependencies [[`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71)]:
  - laymos@0.0.1
  - std-toolkit@0.0.2
  - @pkishorez/lotel@0.0.1
