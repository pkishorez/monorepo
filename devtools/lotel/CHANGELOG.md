# @pkishorez/lotel

## 0.0.7

### Patch Changes

- [`a1c077d`](https://github.com/pkishorez/monorepo/commit/a1c077dd7182632203be59f35d2e475b4df6ab65) Thanks [@pkishorez](https://github.com/pkishorez)! - Adopt std-toolkit's decoded entity types: `EntityType` becomes `DecodedEntity` across the flow, telemetry, and telemetry-store domains.

  The telemetry HTTP payloads built from `EntitySchema` change shape with it — `_v` now rides inside each entity's `value` instead of its `meta`. Client and server must run the same version.

- Updated dependencies [[`eacf385`](https://github.com/pkishorez/monorepo/commit/eacf385ccd0458933758ae6a18ff078f4d669325), [`4da25e4`](https://github.com/pkishorez/monorepo/commit/4da25e426d32fb482406c089ba7c213d1d1bba98), [`6630802`](https://github.com/pkishorez/monorepo/commit/66308024a71ab6a30aa0e1f979527c8fa23f533c), [`211dbe7`](https://github.com/pkishorez/monorepo/commit/211dbe7a900199a9471120fb9e2b03c32c8c43d7), [`8215ec7`](https://github.com/pkishorez/monorepo/commit/8215ec7fea498d366f9b06d9f947db960d5bf90c), [`9bf3b20`](https://github.com/pkishorez/monorepo/commit/9bf3b201e4bf1817b579f86d3840f7b146a65126), [`2cfe607`](https://github.com/pkishorez/monorepo/commit/2cfe6076fe401aec0fa5f3b8e3d9f5ed655228a7)]:
  - std-toolkit@0.0.7
  - @pkishorez/effect-tracer@0.0.7

## 0.0.6

### Patch Changes

- [`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d) Thanks [@pkishorez](https://github.com/pkishorez)! - Release the synchronized toolchain against `effect@4.0.0-rc.110` with matching internal package versions.
- Updated dependencies [[`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d)]:
  - @pkishorez/effect-tracer@0.0.6
  - std-toolkit@0.0.6

## 0.0.5

### Patch Changes

- Updated dependencies []:
  - std-toolkit@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies [[`9786df7`](https://github.com/pkishorez/monorepo/commit/9786df77466cd3ca71f256a374c74ff0fb866e52)]:
  - std-toolkit@0.0.5

## 0.0.3

### Patch Changes

- Updated dependencies [[`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e)]:
  - @pkishorez/effect-tracer@0.0.2
  - std-toolkit@0.0.4

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
