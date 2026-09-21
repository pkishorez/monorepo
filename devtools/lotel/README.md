# @pkishorez/lotel

Telemetry contracts and orchestration for DevTools

## Big picture

An Effect application emits spans and logs over OTLP. Something local has to
receive them, keep them, and hand them back in a shape a UI can sync. lotel is
that something, as a library: an OTLP/HTTP ingestion group, an RPC group for
writing and reading Span Records and Log Records, and a SQLite Telemetry Store
behind a service interface. It runs no server of its own.

[kstack](../devtools/README.md) hosts these layers inside its DevTools Server
and adds the browser UI. [@pkishorez/effect-tracer](../effect-tracer/README.md)
is the sending side. Flows are a separate Tool in
[@pkishorez/flow](../flow/README.md); lotel's records carry a Flow id and
Participant name so the two can link.

Terms are defined in [CONTEXT.md](./CONTEXT.md). Decisions are in
[docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @pkishorez/lotel
```

lotel has no peer dependencies; `effect` is a regular dependency.

## Exports

### `@pkishorez/lotel`

Node. Everything a host process needs.

| Export                      | What it does                                                             |
| --------------------------- | ------------------------------------------------------------------------ |
| `LotelRpc`                  | Re-export of the RPC group from `@pkishorez/lotel/rpc`.                  |
| `LotelRpcLive`              | Layer that fulfils `LotelRpc` against the `TelemetryStore` service.      |
| `LotelOtlpHttpGroup`        | HttpApi group with `POST /v1/traces` and `POST /v1/logs`.                |
| `LotelOtlpHttpLive`         | Layer that decodes OTLP/HTTP JSON and writes it to the `TelemetryStore`. |
| `sqliteTelemetryStoreLayer` | Re-export of the SQLite store layer from `@pkishorez/lotel/sqlite`.      |

### `@pkishorez/lotel/rpc`

Browser-safe. The contract only.

| Export     | What it does                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `LotelRpc` | RPC group with `SaveSpans`, `InsertLogs`, `ListSpans`, `ListLogs`, `ListTraces`, `GetTrace`, and `ClearTelemetry`. |

### `@pkishorez/lotel/telemetry`

Browser-safe. Schemas and errors.

| Export                             | What it does                                                                |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `SpanEntitySchema`                 | A stored Span Record keyed by span id, versioned for migration.             |
| `LogEntitySchema`                  | A stored Log Record keyed by its Log Record ID.                             |
| `NewSpanRecordSchema`              | A Span Record as written by `SaveSpans`, before storage stamps it.          |
| `NewLogRecordSchema`               | A Log Record as written by `InsertLogs`.                                    |
| `UpdateCursorSchema`               | A cursor over the store's Update Cursor: `>`, `>=`, `<`, or `<=` a value.   |
| `ListPayloadSchema`                | Cursor plus optional limit for `ListSpans` and `ListLogs`.                  |
| `SpanListSchema`                   | A page of stored Span Records.                                              |
| `LogListSchema`                    | A page of stored Log Records.                                               |
| `TraceSummarySchema`               | One Trace as a row: root operation, service, timing, span and error counts. |
| `ListTracesPayloadSchema`          | Limit for `ListTraces`.                                                     |
| `TraceSummaryListSchema`           | Recent Trace Summaries, newest first.                                       |
| `TraceDetailsSchema`               | One Trace with all its Span Records and Log Records.                        |
| `BatchWriteResultSchema`           | Accepted and rejected counts for a write.                                   |
| `ClearTelemetryResultSchema`       | Result of `ClearTelemetry`.                                                 |
| `LotelRpcError`                    | Error carrying a store failure message.                                     |
| `TraceNotFound`                    | Error when `GetTrace` finds no spans for the id.                            |
| `ExportTraceServiceRequestSchema`  | The OTLP/HTTP trace export request body.                                    |
| `ExportLogsServiceRequestSchema`   | The OTLP/HTTP logs export request body.                                     |
| `ExportTraceServiceResponseSchema` | The OTLP/HTTP trace export response.                                        |
| `ExportLogsServiceResponseSchema`  | The OTLP/HTTP logs export response.                                         |
| `OtlpBadRequest`                   | HTTP 400 error for an undecodable OTLP body.                                |
| `OtlpInternalError`                | HTTP 500 error for a store failure during ingestion.                        |

### `@pkishorez/lotel/sqlite`

Node.

| Export                      | What it does                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| `sqliteTelemetryStoreLayer` | Builds the `TelemetryStore` layer over a SQLite file path, or `:memory:`. |

## Usage

### Host lotel in your own server

Serve the RPC group and OTLP ingestion on one HTTP server, backed by one
SQLite file. This is what kstack does.

```ts
import { createServer } from 'node:http';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import { LotelOtlpHttpLive, LotelRpc, LotelRpcLive } from '@pkishorez/lotel';
import { sqliteTelemetryStoreLayer } from '@pkishorez/lotel/sqlite';

const RpcRouteLive = RpcServer.layerHttp({
  group: LotelRpc,
  path: '/rpc',
  protocol: 'http',
}).pipe(
  Layer.provide(LotelRpcLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

export const ServerLive = HttpRouter.serve(
  Layer.mergeAll(RpcRouteLive, LotelOtlpHttpLive),
).pipe(
  Layer.provide(sqliteTelemetryStoreLayer({ path: './devtools.sqlite' })),
  Layer.provide(
    NodeHttpServer.layer(createServer, { host: '127.0.0.1', port: 14400 }),
  ),
  Layer.provide(NodeServices.layer),
);
```

How it works:

- `LotelRpcLive` and `LotelOtlpHttpLive` both require the `TelemetryStore`
  service; `sqliteTelemetryStoreLayer` provides it.
- OTLP exporters post to `/v1/traces` and `/v1/logs`; clients call `/rpc`.
- Storage is one replaceable service, so SQLite is not a domain dependency.

### Test against the RPC in memory

Use `RpcTest` and an in-memory SQLite store to exercise the contract without
HTTP.

```ts
import { Effect } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import {
  LotelRpc,
  LotelRpcLive,
  sqliteTelemetryStoreLayer,
} from '@pkishorez/lotel';

const program = Effect.scoped(
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LotelRpc);
    yield* client.SaveSpans({
      records: [{ traceId: 't1', spanId: 's1', span: {}, context: {} }],
    });
    const traces = yield* client.ListTraces({ limit: 10 });
    return traces.items.length; // 1
  }),
).pipe(
  Effect.provide(LotelRpcLive),
  Effect.provide(sqliteTelemetryStoreLayer({ path: ':memory:' })),
);

await Effect.runPromise(program);
```

How it works:

- `RpcTest.makeClient` binds a client to the handlers in scope, no transport.
- `:memory:` gives each test a fresh store.
- `GetTrace` for an unknown id fails with `TraceNotFound`.
