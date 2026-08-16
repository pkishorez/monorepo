---
'@pkishorez/devtools': patch
---

Rebuild the DevTools RPC surface around Laymos architecture analysis and lotel
telemetry.

**Breaking:** the `@pkishorez/devtools/report` subpath export is removed;
`./rpc` is the only export.

**Breaking:** `RunLaymos`, `RunAllStories`, `RunStory`, `RunStoryGroup`,
`DiscoverStories`, `QueryTraces`, `QueryLogs`, `QueryMetrics`, and the catch-all
`DevtoolsRpcError` are gone. `DevtoolsRpc` is now `DevtoolsToolRpc` merged with
lotel's `LotelRpc`.

Add the tool procedures `AnalyzeLaymosProject` (typed layer and module analysis
for a project path), `GetLaymosModuleSource` (module source snapshot with file
navigation), `GetLaymosStories` (the story tree), and the streaming
`RunLaymosStories` (optionally scoped, with per-story progress).

Replace the single opaque error with tagged failures: `InvalidProjectPath`,
`ConfigReadError`, `ConfigParseError`, `ConfigSchemaError`,
`ConfigValidationError`, `SourceAnalysisError`, `ModuleSourceNotFoundError`,
`ModuleSourceReadError`, and `StoriesUnavailableError`.

Telemetry procedures now come straight from `@pkishorez/lotel/rpc` —
`SaveSpans`, `InsertLogs`, `ListSpans`, `ListLogs`, `ListFlows`, `GetTrace`,
`GetFlow`, and `ClearTelemetry` — and the `devtools get-trace <trace-id>`
subcommand is backed by lotel's `GetTrace`, reporting `TraceNotFound` and
`LotelRpcError` on stderr.

**Breaking:** the server no longer exposes `/v1/metrics`; OTLP ingest is
`/v1/traces` and `/v1/logs`.

Drop the `jiti` dependency.
