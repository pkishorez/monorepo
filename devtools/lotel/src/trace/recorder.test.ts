import { Deferred, Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeTraceRecorder } from './recorder.js';
import type { CapturedSpan } from './types.js';

const names = (spans: readonly CapturedSpan[]) => spans.map(({ name }) => name);

describe('makeTraceRecorder', () => {
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
    expect(span?.status).toBe('error');
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
});
