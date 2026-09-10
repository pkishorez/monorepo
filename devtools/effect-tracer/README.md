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
and `FetchHttpClient` instead of the OpenTelemetry SDK. Batches updates every
100 ms or when 100 records are buffered, and stamps `deployment.environment: local`.
Traces and logs use separate requests. Spans that finish within a batch window
replace their provisional update; longer spans export both running and completed
states. Shutdown drains pending records within `shutdownTimeout`.

```ts
import { Layer } from 'effect';
import { makeDevTelemetryLayer } from '@pkishorez/effect-tracer/telemetry/dev-telemetry';

const DevTelemetryLive = import.meta.env.DEV
  ? makeDevTelemetryLayer({
      serviceName: 'my-service',
      batchInterval: '100 millis',
      maxBatchSize: 100,
    })
  : Layer.empty;
```

Adds `batchInterval`, `maxBatchSize`, `retries`, `requestTimeout`, and `shutdownTimeout` on top of the shared
options.

## License

MIT
