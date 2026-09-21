# @pkishorez/effect-tracer

Effect tracing tools for in-process recording and OTLP export

## Big picture

Effect programs already emit spans and logs through `Effect.withSpan` and
`Effect.log`. This package gives that output two destinations. The recorder
keeps spans and logs in memory inside the process, in emission order, so a
test, a Story, or an in-app panel can read them back as plain data. The
telemetry layers export them over OTLP/HTTP to a collector such as the
[kstack](../devtools/README.md) DevTools Server, which stores them with
[@pkishorez/lotel](../lotel/README.md).

The full telemetry layer uses the OpenTelemetry SDK and also exports metrics.
The dev-telemetry layer does the same job for local development with
`effect/unstable/observability` and `fetch`, batching every 100 ms and
exporting provisional spans while they run.

[laymos](../laymos/README.md) Stories use the recorder to attach traces to
reports, and `apps/docs` uses it to drive a live trace panel.

## Install

```sh
pnpm add @pkishorez/effect-tracer
```

Peer dependencies:

- `effect` (`4.0.0-rc.112`): the recorder installs an Effect Tracer and
  Logger, and the layers are Effect Layers.

## Exports

### `@pkishorez/effect-tracer/recorder`

Runs anywhere Effect runs, including the browser.

| Export                  | What it does                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `makeTraceRecorder`     | Creates a recorder with `instrument`, `layer`, and `snapshot`; options cap spans and stream events. |
| `sequenceAttribute`     | The span attribute name (`tracer.sequence`) that carries emission order.                            |
| `tracerAttributePrefix` | The prefix (`tracer.`) of attributes this package adds to spans.                                    |
| `sequenceOrder`         | Pads a sequence number so string sorting matches numeric order.                                     |
| `readSequence`          | Parses a sequence attribute value back to a number, or null.                                        |

### `@pkishorez/effect-tracer/telemetry`

Node. Uses the OpenTelemetry SDK.

| Export               | What it does                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `makeTelemetryLayer` | Builds one Layer exporting traces, logs, and metrics over OTLP/HTTP; each signal can be toggled. |

### `@pkishorez/effect-tracer/telemetry/dev-telemetry`

Runs anywhere `fetch` exists.

| Export                  | What it does                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `makeDevTelemetryLayer` | Builds a batching OTLP/HTTP Layer for local development; stamps `deployment.environment: local`. |

## Usage

### Record a program and read its spans back

Wrap an Effect with `instrument`, run it, then read the snapshot. Spans and
logs come back in the order they were emitted, even inside one millisecond.

```ts
import { Effect } from 'effect';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';

const recorder = makeTraceRecorder();

await Effect.runPromise(
  recorder.instrument(
    Effect.gen(function* () {
      yield* Effect.log('First');
      yield* Effect.void.pipe(Effect.withSpan('child-a'));
      yield* Effect.void.pipe(Effect.withSpan('child-b'));
    }).pipe(Effect.withSpan('parent')),
  ),
);

const { spans, logs, truncated } = recorder.snapshot();
spans.map(({ name }) => name); // ['parent', 'child-a', 'child-b']
spans[1]?.parentSpanId === spans[0]?.spanId; // true
logs[0]?.message; // 'First'
```

How it works:

- `instrument` installs the recorder's Tracer and Logger for that Effect
  only; nothing outside it is recorded.
- Every span and log gets a `sequence` so ties on the clock keep order.
- `maxSpans` (default 2000) stops recording and sets `truncated`; use
  `onSpanEnd` and `onLog` to stream instead of snapshotting.

### Record every Effect a runtime runs

For a long-lived runtime such as a browser demo, provide `recorder.layer`
once instead of wrapping each Effect.

```ts
import { Layer, ManagedRuntime } from 'effect';
import { makeTraceRecorder } from '@pkishorez/effect-tracer/recorder';
import { FlowTelemetry } from '@pkishorez/flow';

const recorder = makeTraceRecorder();

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    recorder.layer,
    FlowTelemetry.layerMemory({ origin: 'browser' }),
  ),
);

// Later, from a panel:
recorder.snapshot().spans;
```

How it works:

- `recorder.layer` is `Layer<never>`; it sets the Tracer and Logger
  references in the runtime.
- `snapshot()` is safe mid-run; running spans report `status: 'running'`.

### Export to a local DevTools Server

Point the dev layer at a running `kstack devtools` and every span and log in
the runtime shows up in the Lotel Tool.

```ts
import { Effect, Layer, ManagedRuntime } from 'effect';
import { makeDevTelemetryLayer } from '@pkishorez/effect-tracer/telemetry/dev-telemetry';

const runtime = ManagedRuntime.make(
  makeDevTelemetryLayer({
    endpoint: 'http://127.0.0.1:14400',
    serviceName: 'server:api-1',
  }),
);

await runtime.runPromise(
  Effect.log('order accepted').pipe(Effect.withSpan('handle-order')),
);

// Disposing drains pending batches within shutdownTimeout.
await runtime.dispose();
```

How it works:

- Traces post to `/v1/traces` and logs to `/v1/logs` as OTLP/HTTP JSON.
- Batches flush every `batchInterval` (100 ms) or at `maxBatchSize` (100).
- A span that ends within a batch window replaces its provisional record;
  longer spans export both running and completed states.
- `makeTelemetryLayer` is the production counterpart with the OpenTelemetry
  SDK and metrics.
