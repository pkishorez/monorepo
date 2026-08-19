# @pkishorez/effect-tracer

Effect tracing tools for in-process recording and OTLP export.

Capture Effect spans and logs inside your own process, model correlated work as
flows, and export telemetry over OTLP/HTTP — without pulling in a telemetry
server.

```sh
npm install @pkishorez/effect-tracer
```

Requires `effect@4.0.0-rc.110` as a peer dependency.

## `@pkishorez/effect-tracer/recorder`

Record spans and logs in-process. `instrument` installs a Tracer and Logger for
the duration of an effect; the snapshot methods read back what was captured.

```ts
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';

const recorder = makeTraceRecorder({ maxSpans: 2000 });

await Effect.runPromise(recorder.instrument(program));

recorder.snapshot(); // every captured span and log
recorder.snapshotFlows(); // captured work grouped by flow
```

Options: `maxSpans` (default `2000`), the `onSpanEnd` / `onLog` / `onTruncated`
streaming callbacks, and `formatValue`.

## `@pkishorez/effect-tracer/flow`

Model correlated work across participants. Flow events are emitted as OTel span
attributes under `flow.*` and `flowattr.*`, so any OTLP backend carries them,
and `projectFlow` turns recorded spans and logs back into a `RecordedFlow`
swim-lane shape.

Exports `initFlow`, `Activation`, `projectFlow`, `flowAttributes`,
`flowAttributePrefix`, and `RecordedFlowSchema`.

## `@pkishorez/effect-tracer/telemetry`

A single Effect `Layer` exporting traces, logs, and metrics over OTLP/HTTP via
the OpenTelemetry SDK.

```ts
import { makeTelemetryLayer } from '@pkishorez/effect-tracer/telemetry';

const TelemetryLive = makeTelemetryLayer({
  serviceName: 'my-service',
  endpoint: 'http://localhost:14400',
});
```

Toggle signals individually with the `traces`, `logs`, and `metrics` options.

## `@pkishorez/effect-tracer/telemetry/dev-telemetry`

The same job for local development, built on `effect/unstable/observability`
and `FetchHttpClient` instead of the OpenTelemetry SDK. Exports immediately
rather than batching, so spans show up as they happen, and stamps
`deployment.environment: local`.

```ts
import { makeDevTelemetryLayer } from '@pkishorez/effect-tracer/telemetry/dev-telemetry';

const DevTelemetryLive = makeDevTelemetryLayer({ serviceName: 'my-service' });
```

Adds `retries`, `requestTimeout`, and `shutdownTimeout` on top of the shared
options.

## License

MIT
