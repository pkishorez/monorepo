# @pkishorez/lotel

## 0.0.2

### Patch Changes

- [`f055c4e`](https://github.com/pkishorez/monorepo/commit/f055c4ea6ab9fe0d8f75bfba013a0febbdd4cbe4) Thanks [@pkishorez](https://github.com/pkishorez)! - This release replaces lotel's API wholesale.

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

- Updated dependencies [[`8c24af2`](https://github.com/pkishorez/monorepo/commit/8c24af227c83ab532ff0865cbff44a9b5db3d34e), [`4be44ed`](https://github.com/pkishorez/monorepo/commit/4be44ed7294438f8c08bd00124b8e134b91971a6)]:
  - std-toolkit@0.0.3
  - @pkishorez/effect-tracer@0.0.1

## 0.0.1

### Patch Changes

- Updated dependencies [[`6d15b71`](https://github.com/pkishorez/monorepo/commit/6d15b71455a81ce4bd542f6d288eb9dfa4d04d71)]:
  - std-toolkit@0.0.2
