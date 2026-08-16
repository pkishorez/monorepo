---
'@pkishorez/effect-tracer': patch
---

Initial release. `@pkishorez/effect-tracer` captures Effect spans and logs
in-process and exports telemetry over OTLP/HTTP, without depending on a
telemetry server.

It was extracted out of `@pkishorez/lotel`, whose `@pkishorez/lotel/trace`
subpath is removed in the same release. The recorder never used anything from
lotel's server and lotel never used the recorder, so pulling it out lets
consumers capture Effect spans on their own, and it removes the
`std-toolkit -> laymos -> lotel -> std-toolkit` workspace cycle that made build
ordering non-deterministic.

```diff
-import { makeTraceRecorder } from '@pkishorez/lotel/trace';
+import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
```

Four entrypoints:

- `@pkishorez/effect-tracer/recorder` — `makeTraceRecorder`. `instrument(effect)`
  installs a Tracer and Logger so every span and log inside is captured;
  `snapshot()`, `snapshotFlow(id)`, and `snapshotFlows()` read them back.
  Options: `maxSpans` (default 2000), the `onSpanEnd` / `onLog` / `onTruncated`
  streaming callbacks, and `formatValue`.
- `@pkishorez/effect-tracer/flow` — model correlated work across participants.
  `initFlow`, `Activation`, `flowAttributes`, and `flowAttributePrefix` emit
  activations, messages, replies, local events, and state as OTel span
  attributes under `flow.*` and `flowattr.*`; `projectFlow` and
  `RecordedFlowSchema` project recorded spans and logs back into a swim-lane
  `RecordedFlow`.
- `@pkishorez/effect-tracer/telemetry` — `makeTelemetryLayer`, one Effect
  `Layer` exporting traces, logs, and metrics over OTLP/HTTP via the
  OpenTelemetry SDK, with `endpoint` (default `http://localhost:14400`),
  `serviceName`, `serviceVersion`, and per-signal toggles.
- `@pkishorez/effect-tracer/telemetry/dev-telemetry` — `makeDevTelemetryLayer`,
  the same job for local development built on `effect/unstable/observability`
  and `FetchHttpClient` instead of the OpenTelemetry SDK. Exports immediately
  rather than batching, adds `retries`, `requestTimeout`, and `shutdownTimeout`,
  and stamps `deployment.environment: local`.

Requires `effect@^4.0.0-beta.102` as a peer dependency.
