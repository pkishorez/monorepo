---
'@pkishorez/lotel': patch
---

Reshape lotel into a layered telemetry library: domain contracts, an
orchestrator composing the RPC and OTLP/HTTP surfaces, and a replaceable
telemetry store service.

**Breaking:** the `./domain` and `./client` subpath exports are gone. The
surface is now `.` (`LotelRpc`, `LotelRpcLive`, `LotelOtlpHttpGroup`,
`LotelOtlpHttpLive`, `sqliteTelemetryStoreLayer`), `@pkishorez/lotel/rpc` (the
`LotelRpc` group alone, for frontends), `@pkishorez/lotel/telemetry` (span, log,
and trace schemas and errors), `@pkishorez/lotel/flow` (flow schemas and
projection), and `@pkishorez/lotel/sqlite`
(`sqliteTelemetryStoreLayer({ path })`).

**Breaking:** the `lotel` binary is removed. lotel no longer runs its own
server — host its `LotelOtlpHttpLive` and `LotelRpcLive` layers in your own
process, as `@pkishorez/devtools` does.

**Breaking:** metrics are no longer supported. `MetricRecordSchema`,
`queryMetrics`, and the `/v1/metrics` ingest endpoint are gone; OTLP ingest is
`/v1/traces` and `/v1/logs`. The old `TraceRecordSchema`, `LogRecordSchema`,
`clearTelemetry`, `queryTraces`, and `queryLogs` exports and the `LotelApi` /
`LotelGroup` / `Db` / `makeDbLayer` HTTP-API surface are replaced by the
`LotelRpc` group.

**Breaking:** the `@pkishorez/lotel/trace` subpath is removed. Import
`makeTraceRecorder` from `@pkishorez/effect-tracer/recorder` instead.

Add the `LotelRpc` procedures `SaveSpans`, `InsertLogs`, `ListSpans`,
`ListLogs`, `ListFlows`, `GetTrace`, `GetFlow`, and `ClearTelemetry`, with
`TraceNotFound`, `FlowNotFound`, and `LotelRpcError` as typed failures.

Add Flows: correlated work recorded across participants. Spans and logs carrying
the `@pkishorez/effect-tracer` flow attributes are indexed into a `Flow` entity
as they are ingested, listed via `ListFlows`, and projected into a swim-lane
`RecordedFlow` via `GetFlow`.

Storage moves behind the `TelemetryStore` service, so the SQLite adapter is one
implementation rather than a hard dependency of the domain.

Dependencies: add `@pkishorez/effect-tracer` for the flow contract and schemas,
keep `std-toolkit`, and drop `@effect/platform-node`, which is no longer needed
now that lotel does not own a server process.

Add a README.
