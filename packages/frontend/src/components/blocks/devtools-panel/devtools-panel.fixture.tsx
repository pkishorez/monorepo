import { useState } from 'react';
import { Bug } from 'lucide-react';
import { Effect } from 'effect';
import {
  makeTraceRecorder,
  type TraceRecorder,
} from '@pkishorez/effect-tracer/recorder';
import { Activation, initFlow } from '@pkishorez/effect-tracer/flow';
import { Button } from '#components/ui/button';
import { DevToolsPanel } from './devtools-panel';

function runCheckoutFlow(recorder: TraceRecorder, id: string) {
  const client = initFlow({ id, participantName: 'checkout-ui' });
  const api = initFlow({ id, participantName: 'orders-api' });
  return recorder.instrument(
    Effect.gen(function* () {
      const activation = yield* api.activation.start('Handle checkout');
      yield* Effect.sleep('1 millis').pipe(
        client.withSpan('Submit checkout form'),
      );
      yield* client.log('Form validated');
      const token = yield* client.send('orders-api', { type: 'checkout' });
      yield* Effect.sleep('1 millis').pipe(api.withSpan('Create order'));
      yield* api.reply(token, 'Order created');
      yield* activation.end(Activation.completed());
    }),
  );
}

function runPlainTrace(recorder: TraceRecorder, name: string) {
  return recorder.instrument(
    Effect.gen(function* () {
      yield* Effect.void.pipe(Effect.withSpan(name));
      yield* Effect.sleep('1 millis').pipe(
        Effect.withSpan(`${name} - validate`),
      );
    }),
  );
}

/** One plain Trace alongside one Flow - the everyday mixed case. */
function makeMixedRecorder() {
  const recorder = makeTraceRecorder();
  Effect.runPromise(runPlainTrace(recorder, 'render home page')).catch(
    () => {},
  );
  Effect.runPromise(runCheckoutFlow(recorder, 'checkout-1')).catch(() => {});
  return recorder;
}

/** Several unrelated Traces and no Flows - proves the Traces tab lists them for selection. */
function makeMultiTraceRecorder() {
  const recorder = makeTraceRecorder();
  for (const name of ['GET /health', 'POST /login', 'GET /dashboard']) {
    Effect.runPromise(runPlainTrace(recorder, name)).catch(() => {});
  }
  return recorder;
}

/** Several independent Flows and no plain Traces - proves the Flows tab lists them for selection. */
function makeMultiFlowRecorder() {
  const recorder = makeTraceRecorder();
  for (const id of ['checkout-1', 'checkout-2', 'refund-1']) {
    Effect.runPromise(runCheckoutFlow(recorder, id)).catch(() => {});
  }
  return recorder;
}

function runBatchFlow(recorder: TraceRecorder, id: string, itemCount: number) {
  const client = initFlow({ id, participantName: 'client' });
  const worker = initFlow({ id, participantName: 'worker' });
  return recorder.instrument(
    Effect.gen(function* () {
      const activation = yield* worker.activation.start('Process batch');
      for (let index = 1; index <= itemCount; index++) {
        yield* Effect.sleep('1 millis').pipe(
          client.withSpan(`Prepare item ${index}`),
        );
        yield* client.log(`Item ${index} ready`);
        const token = yield* client.send('worker', { item: index });
        yield* Effect.sleep('1 millis').pipe(
          worker.withSpan(`Handle item ${index}`),
        );
        yield* worker.reply(token, `Item ${index} processed`);
      }
      yield* activation.end(Activation.completed());
    }),
  );
}

/** One Flow with many activities - exercises the swimlane's own scrolling. */
function makeLargeFlowRecorder() {
  const recorder = makeTraceRecorder();
  Effect.runPromise(runBatchFlow(recorder, 'batch-1', 25)).catch(() => {});
  return recorder;
}

function DevToolsPanelDemo({
  recorder,
  defaultFilter,
  startOpen = false,
}: {
  recorder: TraceRecorder;
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
        recorder={recorder}
        open={open}
        onClose={() => setOpen(false)}
        defaultFilter={defaultFilter}
      />
    </div>
  );
}

function ControlledDemo() {
  const [recorder] = useState(makeMixedRecorder);
  return <DevToolsPanelDemo recorder={recorder} />;
}

function TracesOnlyDemo() {
  const [recorder] = useState(makeMultiTraceRecorder);
  return (
    <DevToolsPanelDemo recorder={recorder} defaultFilter="traces" startOpen />
  );
}

function FlowsOnlyDemo() {
  const [recorder] = useState(makeMultiFlowRecorder);
  return (
    <DevToolsPanelDemo recorder={recorder} defaultFilter="flows" startOpen />
  );
}

function LargeFlowDemo() {
  const [recorder] = useState(makeLargeFlowRecorder);
  return (
    <DevToolsPanelDemo recorder={recorder} defaultFilter="flows" startOpen />
  );
}

export default {
  controlled: <ControlledDemo />,
  'traces only': <TracesOnlyDemo />,
  'flows only': <FlowsOnlyDemo />,
  'large flow': <LargeFlowDemo />,
};
