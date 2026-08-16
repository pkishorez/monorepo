---
'@pkishorez/devtools': patch
---

This release replaces the DevTools RPC surface wholesale.

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
