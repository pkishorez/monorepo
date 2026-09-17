import { useState } from 'react';
import { Bug } from 'lucide-react';
import { Effect, Layer, ManagedRuntime } from 'effect';
import {
  makeTraceRecorder,
  type TraceRecorder,
} from '@pkishorez/effect-tracer/recorder';
import { Activation, Flow, FlowTelemetry } from '@pkishorez/flow';
import { Button } from '#components/ui/button';
import { DevToolsPanel } from './devtools-panel';

type Runtime = ManagedRuntime.ManagedRuntime<never, never>;

function runCheckoutFlow(id: string) {
  const flow = Flow.make({ id });
  const client = flow.participant('checkout-ui');
  const api = flow.participant('orders-api');
  return Effect.gen(function* () {
    const activation = yield* api.activation.start('Handle checkout');
    yield* Effect.sleep('1 millis').pipe(
      Effect.withSpan('Submit checkout form'),
    );
    yield* client.event('Form validated');
    const token = yield* client.send(api, 'checkout');
    yield* Effect.sleep('1 millis').pipe(Effect.withSpan('Create order'));
    yield* api.check('order total is positive', true);
    yield* api.reply(token, 'Order created');
    yield* activation.end(Activation.completed());
  });
}

function runPlainTrace(name: string) {
  return Effect.gen(function* () {
    yield* Effect.void.pipe(Effect.withSpan(name));
    yield* Effect.sleep('1 millis').pipe(Effect.withSpan(`${name} - validate`));
  });
}

function runBatchFlow(id: string, itemCount: number) {
  const flow = Flow.make({ id });
  const client = flow.participant('client');
  const worker = flow.participant('worker');
  return Effect.gen(function* () {
    const activation = yield* worker.activation.start('Process batch');
    for (let index = 1; index <= itemCount; index++) {
      yield* client.event(`Item ${index} ready`);
      const token = yield* client.send(worker, `item ${index}`);
      yield* worker.waiting(`handle item ${index}`)(Effect.sleep('1 millis'));
      yield* worker.reply(token, `Item ${index} processed`);
    }
    yield* activation.end(Activation.completed());
  });
}

/** A Runtime that records Traces into `recorder` and Flows into memory. */
function makeRuntime(recorder: TraceRecorder): Runtime {
  return ManagedRuntime.make(
    Layer.merge(recorder.layer, FlowTelemetry.layerMemory()),
  );
}

/** One plain Trace alongside one Flow - the everyday mixed case. */
function makeMixed() {
  const recorder = makeTraceRecorder();
  const runtime = makeRuntime(recorder);
  runtime.runPromise(runPlainTrace('render home page')).catch(() => {});
  runtime.runPromise(runCheckoutFlow('checkout-1')).catch(() => {});
  return { recorder, runtime };
}

/** Several unrelated Traces and no Flows - proves the Traces tab lists them for selection. */
function makeMultiTrace() {
  const recorder = makeTraceRecorder();
  const runtime = makeRuntime(recorder);
  for (const name of ['GET /health', 'POST /login', 'GET /dashboard']) {
    runtime.runPromise(runPlainTrace(name)).catch(() => {});
  }
  return { recorder, runtime };
}

/** Several independent Flows and no plain Traces - proves the Flows tab lists them for selection. */
function makeMultiFlow() {
  const recorder = makeTraceRecorder();
  const runtime = makeRuntime(recorder);
  for (const id of ['checkout-1', 'checkout-2', 'refund-1']) {
    runtime.runPromise(runCheckoutFlow(id)).catch(() => {});
  }
  return { recorder, runtime };
}

/** One Flow with many steps - exercises the swimlane's own scrolling. */
function makeLargeFlow() {
  const recorder = makeTraceRecorder();
  const runtime = makeRuntime(recorder);
  runtime.runPromise(runBatchFlow('batch-1', 25)).catch(() => {});
  return { recorder, runtime };
}

/** A Runtime with no Flow Telemetry at all - the panel says so. */
function makeUnconfigured() {
  const recorder = makeTraceRecorder();
  const runtime: Runtime = ManagedRuntime.make(recorder.layer);
  runtime.runPromise(runCheckoutFlow('checkout-silent')).catch(() => {});
  return { recorder, runtime };
}

function DevToolsPanelDemo({
  recorder,
  runtime,
  defaultFilter,
  startOpen = false,
}: {
  recorder: TraceRecorder;
  runtime: Runtime;
  defaultFilter?: 'traces' | 'flows';
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="relative min-h-screen bg-muted/30">
      <Button
        variant="default"
        size="icon"
        className="fixed bottom-4 left-4 z-50 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Open DevTools panel"
      >
        <Bug />
      </Button>
      <DevToolsPanel
        runtime={runtime}
        recorder={recorder}
        open={open}
        onClose={() => setOpen(false)}
        defaultFilter={defaultFilter}
      />
    </div>
  );
}

function Demo({
  make,
  defaultFilter,
  startOpen,
}: {
  make: () => { recorder: TraceRecorder; runtime: Runtime };
  defaultFilter?: 'traces' | 'flows';
  startOpen?: boolean;
}) {
  const [{ recorder, runtime }] = useState(make);
  return (
    <DevToolsPanelDemo
      recorder={recorder}
      runtime={runtime}
      defaultFilter={defaultFilter}
      startOpen={startOpen}
    />
  );
}

export default {
  controlled: <Demo make={makeMixed} />,
  'traces only': (
    <Demo make={makeMultiTrace} defaultFilter="traces" startOpen />
  ),
  'flows only': <Demo make={makeMultiFlow} defaultFilter="flows" startOpen />,
  'large flow': <Demo make={makeLargeFlow} defaultFilter="flows" startOpen />,
  'no flow telemetry': (
    <Demo make={makeUnconfigured} defaultFilter="flows" startOpen />
  ),
};
