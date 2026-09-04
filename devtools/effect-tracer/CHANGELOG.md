# @pkishorez/effect-tracer

## 0.0.8

### Patch Changes

- [#29](https://github.com/pkishorez/monorepo/pull/29) [`b0730f3`](https://github.com/pkishorez/monorepo/commit/b0730f371943d2f45b144103302cc64563f25ff7) Thanks [@pkishorez](https://github.com/pkishorez)! - Order spans and logs strictly by emission, even when they share a millisecond. The tracer stamps one process-wide sequence on every span and log: the recorder keeps it as `sequence` on captured spans and logs and uses it to break timestamp ties, and the OTLP and dev telemetry layers carry it as the `tracer.sequence` attribute. lotel orders Flow Items by that sequence when present, falling back to arrival order, and hides `tracer.*` attributes like `flow.*`.

## 0.0.7

### Patch Changes

- [`9bf3b20`](https://github.com/pkishorez/monorepo/commit/9bf3b201e4bf1817b579f86d3840f7b146a65126) Thanks [@pkishorez](https://github.com/pkishorez)! - `TraceRecorder` gains a `layer` door - an Effect `Layer` that installs the recorder's tracer and logger into a Runtime once, so every Effect that Runtime subsequently runs is recorded automatically. `instrument` still works for tracing one Effect in isolation. `TraceRecorder` is now exported from `recorder`, since a caller building this layer's host component needs to name it.

## 0.0.6

### Patch Changes

- [`66f7e10`](https://github.com/pkishorez/monorepo/commit/66f7e10cc241c31e3d204f237a8ba05fab1a060d) Thanks [@pkishorez](https://github.com/pkishorez)! - Release the synchronized toolchain against `effect@4.0.0-rc.110` with matching internal package versions.

## 0.0.2

### Patch Changes

- [`3e4f58d`](https://github.com/pkishorez/monorepo/commit/3e4f58d500e3060b5a027f2a370e6ff0de233a5e) Thanks [@pkishorez](https://github.com/pkishorez)! - Pin the `effect` peer dependency (and other registry peers) to exact versions. The previous `^4.0.0-beta.102` range also matched `4.0.0-rc.*` prereleases, so fresh installs (e.g. `npx laymos`) resolved an incompatible `effect` build and crashed with `ERR_MODULE_NOT_FOUND`.

## 0.0.1

### Patch Changes

- [`4be44ed`](https://github.com/pkishorez/monorepo/commit/4be44ed7294438f8c08bd00124b8e134b91971a6) Thanks [@pkishorez](https://github.com/pkishorez)! - Initial release. Capture Effect spans and logs in your own process, and export
  telemetry over OTLP/HTTP — without running a telemetry server.

  It was extracted from `@pkishorez/lotel`, where it sat at
  `@pkishorez/lotel/trace`. The recorder never used lotel's server and lotel never
  used the recorder, so separating them lets you record Effect spans on their own.

  **`@pkishorez/effect-tracer/recorder`** — record in-process. `instrument` installs
  a Tracer and Logger for the duration of an effect; the snapshots read back what
  was captured.

  ```ts
  const recorder = makeTraceRecorder();
  await Effect.runPromise(recorder.instrument(program));
  recorder.snapshot();
  ```

  Tune with `maxSpans` (default 2000), `formatValue`, and the `onSpanEnd` /
  `onLog` / `onTruncated` callbacks for streaming.

  **`@pkishorez/effect-tracer/flow`** — model correlated work across participants.
  Activations, messages, replies, and state are emitted as OTel span attributes
  under `flow.*`, so any OTLP backend carries them, and `projectFlow` turns
  recorded spans and logs back into a swim-lane `RecordedFlow`.

  **`@pkishorez/effect-tracer/telemetry`** — `makeTelemetryLayer` exports traces,
  logs, and metrics over OTLP/HTTP through the OpenTelemetry SDK, with per-signal
  toggles.

  **`@pkishorez/effect-tracer/telemetry/dev-telemetry`** — the same job for local
  development, built on `effect/unstable/observability` instead of the OTel SDK.
  Exports immediately rather than batching, so spans appear as they happen.

  Requires `effect@^4.0.0-beta.102`.
