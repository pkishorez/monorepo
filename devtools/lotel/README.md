# @pkishorez/lotel

A local telemetry store for Effect applications: ingest OTLP traces and logs,
then query them back over a typed RPC surface.

lotel is a library, not a server. It gives you layers you host inside your own
process — `kstack` does exactly that.

```sh
npm install @pkishorez/lotel
```

## `@pkishorez/lotel`

The root export composes the pieces you host:

```ts
import {
  LotelOtlpHttpLive,
  LotelRpcLive,
  sqliteTelemetryStoreLayer,
} from '@pkishorez/lotel';
```

- `LotelOtlpHttpGroup` / `LotelOtlpHttpLive` — OTLP/HTTP ingest on `/v1/traces`
  and `/v1/logs`.
- `LotelRpc` / `LotelRpcLive` — the query and write surface.
- `sqliteTelemetryStoreLayer` — the SQLite `TelemetryStore` implementation.

Storage sits behind the `TelemetryStore` service, so SQLite is one
implementation rather than a hard dependency of the domain.

## `@pkishorez/lotel/rpc`

The `LotelRpc` group on its own, for frontends and other clients that must not
pull in the server implementation.

Procedures: `SaveSpans`, `InsertLogs`, `ListSpans`, `ListLogs`, `ListTraces`,
`GetTrace`, and `ClearTelemetry`. `ListTraces` returns Trace Summaries for the
most recently updated Traces, newest first. Failures are typed —
`TraceNotFound` and `LotelRpcError`.

## `@pkishorez/lotel/telemetry`

Span, log, and trace schemas plus their error types.

## `@pkishorez/lotel/sqlite`

```ts
import { sqliteTelemetryStoreLayer } from '@pkishorez/lotel/sqlite';

const StoreLive = sqliteTelemetryStoreLayer({ path: './telemetry.db' });
```

## License

MIT
