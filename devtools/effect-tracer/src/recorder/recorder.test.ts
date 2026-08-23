import { Clock, Deferred, Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTraceRecorder } from './recorder.js';
import type { CapturedSpan, TraceRecorder } from './recorder.js';
import { Activation, initFlow } from '../flow/flow.js';

const names = (spans: readonly CapturedSpan[]) => spans.map(({ name }) => name);

const token = (flow: ReturnType<TraceRecorder['snapshotFlow']>) =>
  flow?.items.find(
    (item) => item.kind === 'message' && item.destination === 'server',
  )?.messageId;

describe('makeTraceRecorder', () => {
  it('keeps emission order when spans and logs share a millisecond', async () => {
    const frozen: Clock.Clock = {
      currentTimeMillisUnsafe: () => 1_000,
      currentTimeMillis: Effect.succeed(1_000),
      monotonicTimeNanosUnsafe: () => 1_000_000_000n,
      monotonicTimeNanos: Effect.succeed(1_000_000_000n),
      currentTimeNanosUnsafe: () => 1_000_000_000n,
      currentTimeNanos: Effect.succeed(1_000_000_000n),
      sleep: () => Effect.void,
    };
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'call-123', participantName: 'client' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          yield* flow.log('First');
          yield* Effect.void.pipe(flow.withSpan('Second'));
          yield* flow.log('Third');
          yield* Effect.void.pipe(flow.withSpan('Fourth'));
        }).pipe(Effect.provideService(Clock.Clock, frozen)),
      ),
    );

    const trace = recorder.snapshot();
    expect(names(trace.spans)).toEqual(['Second', 'Fourth']);
    expect(trace.logs.map(({ message }) => message)).toEqual([
      'First',
      'Third',
    ]);
    expect(
      recorder.snapshotFlow('call-123')?.items.map(({ name }) => name),
    ).toEqual(['First', 'Second', 'Third', 'Fourth']);
  });

  it('exposes recorded Flow activities, events, messages, and Activations', async () => {
    const recorder = makeTraceRecorder();
    const client = initFlow({ id: 'call-123', participantName: 'client-a' });
    const server = initFlow({ id: 'call-123', participantName: 'server' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          const activation = yield* server.activation.start('Session');
          yield* Effect.sleep('1 millis').pipe(client.withSpan('Create offer'));
          yield* client.log('Offer ready');
          const token = yield* client.send('server', { type: 'offer' });
          yield* Effect.sleep('1 millis').pipe(server.withSpan('Accept offer'));
          yield* server.reply(token, 'Offer accepted');
          yield* activation.end(Activation.completed());
        }),
      ),
    );

    const flow = recorder.snapshotFlow('call-123');
    expect(flow?.items.filter(({ kind }) => kind === 'activity')).toHaveLength(
      2,
    );
    expect(
      flow?.items.filter(({ kind }) => kind === 'local-event'),
    ).toHaveLength(1);
    expect(flow?.items).toContainEqual(
      expect.objectContaining({
        kind: 'activity',
        participantName: 'client-a',
        name: 'Create offer',
      }),
    );
    expect(flow?.items).toContainEqual(
      expect.objectContaining({ kind: 'message', destination: 'server' }),
    );
    expect(flow?.items).toContainEqual(
      expect.objectContaining({
        kind: 'message',
        destination: 'client-a',
        replyTo: token(flow),
      }),
    );
    expect(flow?.activations).toEqual([
      expect.objectContaining({
        participantName: 'server',
        name: 'Session',
        outcome: 'completed',
      }),
    ]);
    expect(flow?.warnings).toEqual([]);
    expect(recorder.snapshotFlows()).toHaveLength(1);
  });

  it('records spans nested under their parent', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      recorder.instrument(
        Effect.gen(function* () {
          yield* Effect.void.pipe(Effect.withSpan('child-a'));
          yield* Effect.void.pipe(Effect.withSpan('child-b'));
        }).pipe(Effect.withSpan('parent')),
      ),
    );

    const { spans } = recorder.snapshot();
    expect(names(spans)).toEqual(['parent', 'child-a', 'child-b']);

    const [parent, childA] = spans;
    expect(parent?.parentSpanId).toBeNull();
    expect(childA?.parentSpanId).toBe(parent?.spanId);
    expect(childA?.traceId).toBe(parent?.traceId);
  });

  it('records attributes, events and success status', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      recorder.instrument(
        Effect.void.pipe(
          Effect.withSpan('checkout', { attributes: { orderId: 'order-1' } }),
        ),
      ),
    );

    const [span] = recorder.snapshot().spans;
    expect(span?.status).toBe('success');
    expect(span?.attributes.orderId).toBe('order-1');
    expect(span?.endTime).not.toBeNull();
  });

  it('attaches nested plain logs to their Flow activity', async () => {
    const recorder = makeTraceRecorder();
    const flow = initFlow({ id: 'probe', participantName: 'worker' });

    await Effect.runPromise(
      recorder.instrument(
        flow.withSpan('Doing work')(
          Effect.log('direct detail').pipe(
            Effect.andThen(
              Effect.logWarning('nested detail').pipe(
                Effect.withSpan('plain-span'),
              ),
            ),
            Effect.andThen(
              flow.withSpan('Inner activity')(Effect.log('owned elsewhere')),
            ),
          ),
        ),
      ),
    );

    const [recorded] = recorder.snapshotFlows();
    const activities = (recorded?.items ?? []).filter(
      (item) => item.kind === 'activity',
    );
    const outer = activities.find(({ name }) => name === 'Doing work');
    const inner = activities.find(({ name }) => name === 'Inner activity');
    expect(
      outer?.logs?.map(({ message, severity }) => [message, severity]),
    ).toEqual([
      ['direct detail', 'info'],
      ['nested detail', 'warning'],
    ]);
    expect(inner?.logs?.map(({ message }) => message)).toEqual([
      'owned elsewhere',
    ]);
  });

  it('marks a failed span as an error', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      recorder.instrument(
        Effect.fail('boom').pipe(Effect.withSpan('failing'), Effect.ignore),
      ),
    );

    expect(recorder.snapshot().spans[0]?.status).toBe('error');
  });

  it('closes spans when the program is interrupted', async () => {
    const recorder = makeTraceRecorder();

    const fiber = Effect.runFork(
      recorder.instrument(Effect.never.pipe(Effect.withSpan('forever'))),
    );
    await Effect.runPromise(Fiber.interrupt(fiber));

    const [span] = recorder.snapshot().spans;
    expect(span?.name).toBe('forever');
    expect(span?.status).toBe('interrupted');
    expect(span?.endTime).not.toBeNull();
  });

  it('reports a span still open at snapshot time as running', async () => {
    const recorder = makeTraceRecorder();
    const opened = await Effect.runPromise(Deferred.make<void>());

    const fiber = Effect.runFork(
      recorder.instrument(
        Deferred.succeed(opened, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.withSpan('forever'),
        ),
      ),
    );
    await Effect.runPromise(Deferred.await(opened));

    const [span] = recorder.snapshot().spans;
    expect(span?.name).toBe('forever');
    expect(span?.status).toBe('running');
    expect(span?.endTime).toBeNull();

    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  it('throws on an open span when requireFinishedSpans is set', async () => {
    const recorder = makeTraceRecorder({ requireFinishedSpans: true });
    const opened = await Effect.runPromise(Deferred.make<void>());

    const fiber = Effect.runFork(
      recorder.instrument(
        Deferred.succeed(opened, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.withSpan('forever'),
        ),
      ),
    );
    await Effect.runPromise(Deferred.await(opened));

    expect(() => recorder.snapshot()).toThrow(/did not finish/);

    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  it('records logs against the span they were emitted in', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      recorder.instrument(
        Effect.log('charging').pipe(
          Effect.annotateLogs('orderId', 'order-2'),
          Effect.withSpan('payment'),
        ),
      ),
    );

    const { spans, logs } = recorder.snapshot();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.message).toBe('charging');
    expect(logs[0]?.level).toBe('Info');
    expect(logs[0]?.annotations.orderId).toBe('order-2');
    expect(logs[0]?.spanId).toBe(spans[0]?.spanId);
  });

  it('detaches logs emitted outside any recorded span', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(recorder.instrument(Effect.log('no span here')));

    expect(recorder.snapshot().logs[0]?.spanId).toBeNull();
  });

  it('streams spans and logs as they happen', async () => {
    const streamed: string[] = [];
    const recorder = makeTraceRecorder({
      onSpanEnd: (span) => streamed.push(`span:${span.name}`),
      onLog: (log) => streamed.push(`log:${String(log.message)}`),
    });

    await Effect.runPromise(
      recorder.instrument(
        Effect.log('inside').pipe(Effect.withSpan('streamed')),
      ),
    );

    expect(streamed).toEqual(['log:inside', 'span:streamed']);
  });

  it('stops recording past maxSpans and reports truncation', async () => {
    const limits: number[] = [];
    const recorder = makeTraceRecorder({
      maxSpans: 3,
      onTruncated: (limit) => limits.push(limit),
    });

    await Effect.runPromise(
      recorder.instrument(
        Effect.forEach([1, 2, 3, 4, 5], (index) =>
          Effect.void.pipe(Effect.withSpan(`span-${index}`)),
        ),
      ),
    );

    const trace = recorder.snapshot();
    expect(trace.spans).toHaveLength(3);
    expect(trace.truncated).toBe(true);
    expect(limits).toEqual([3]);
  });

  it('renders non-serialisable attributes with formatValue', async () => {
    const recorder = makeTraceRecorder({ formatValue: () => '<custom>' });

    await Effect.runPromise(
      recorder.instrument(
        Effect.void.pipe(
          Effect.withSpan('weird', { attributes: { fn: () => undefined } }),
        ),
      ),
    );

    expect(recorder.snapshot().spans[0]?.attributes.fn).toBe('<custom>');
  });

  it('records nothing outside the instrumented effect', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      Effect.void
        .pipe(Effect.withSpan('outside'))
        .pipe(Effect.andThen(recorder.instrument(Effect.void))),
    );

    expect(recorder.snapshot().spans).toHaveLength(0);
  });

  it('records every span run through a Runtime once its layer is provided', async () => {
    const recorder = makeTraceRecorder();

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.void.pipe(Effect.withSpan('first'));
        yield* Effect.void.pipe(Effect.withSpan('second'));
      }).pipe(Effect.provide(recorder.layer)),
    );

    expect(names(recorder.snapshot().spans)).toEqual(
      expect.arrayContaining(['first', 'second']),
    );
  });
});
