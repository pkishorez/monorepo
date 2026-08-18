# @pkishorez/devtools

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
