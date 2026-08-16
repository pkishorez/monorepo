---
'@pkishorez/lotel': patch
---

This release replaces lotel's API wholesale.

**lotel is a library you host, not a server you run.** There's no `lotel`
binary; you compose its layers into your own process, the way
`@pkishorez/devtools` does:

```ts
import {
  LotelOtlpHttpLive,
  LotelRpcLive,
  sqliteTelemetryStoreLayer,
} from '@pkishorez/lotel';
```

`LotelOtlpHttpLive` ingests OTLP over `/v1/traces` and `/v1/logs`.
`LotelRpcLive` serves the query surface. Storage sits behind a `TelemetryStore`
service, so `sqliteTelemetryStoreLayer({ path })` is one implementation you can
swap rather than something the domain depends on.

**One typed RPC surface.** `SaveSpans`, `InsertLogs`, `ListSpans`, `ListLogs`,
`ListFlows`, `GetTrace`, `GetFlow`, and `ClearTelemetry`, failing with
`TraceNotFound`, `FlowNotFound`, or `LotelRpcError`. Frontends import the group
alone from `@pkishorez/lotel/rpc` so they don't pull in the implementation.

**Flows show correlated work across participants.** Spans and logs carrying
`@pkishorez/effect-tracer`'s flow attributes are indexed into a `Flow` as they
arrive, listed with `ListFlows`, and projected into a swim-lane `RecordedFlow`
with `GetFlow`.

Schemas live at `@pkishorez/lotel/telemetry` and `@pkishorez/lotel/flow`; the
SQLite store at `@pkishorez/lotel/sqlite`. The trace recorder that used to sit
at `@pkishorez/lotel/trace` is now its own package,
`@pkishorez/effect-tracer/recorder`. Metrics are no longer collected.

Adds a README.
