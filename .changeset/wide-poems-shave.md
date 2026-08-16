---
'@pkishorez/effect-tracer': patch
---

Initial release. Capture Effect spans and logs in your own process, and export
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
