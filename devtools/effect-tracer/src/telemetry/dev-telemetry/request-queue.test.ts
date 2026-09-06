import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { HttpClient, HttpClientResponse } from 'effect/unstable/http';
import { expect, it } from 'vitest';
import { makeRequestQueue } from './request-queue.js';
import { makeDevTelemetryLayer } from './dev-telemetry.js';

const trace = (id: string, completed = false) => ({
  url: 'https://collector.example/v1/traces',
  body: { resourceSpans: [{ id, completed }] },
});
const log = (message: string) => ({
  url: 'https://collector.example/v1/logs',
  body: { resourceLogs: [{ message }] },
});
type Sent = {
  url: string;
  body: { resourceSpans?: unknown[]; resourceLogs?: unknown[] };
};
const run = (
  use: (
    queue: Effect.Success<ReturnType<typeof makeRequestQueue>>,
    sent: Sent[],
  ) => Effect.Effect<unknown>,
  maxBatchSize = 100,
) => {
  const sent: Sent[] = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      if (request.body._tag !== 'Uint8Array')
        throw new Error('Expected JSON bytes');
      sent.push({
        url: request.url,
        body: JSON.parse(new TextDecoder().decode(request.body.body)),
      });
      return HttpClientResponse.fromWeb(request, new Response('{}'));
    }),
  );
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const queue = yield* makeRequestQueue({
            batchInterval: '100 millis',
            maxBatchSize,
            retries: 0,
            requestTimeout: '3 seconds',
            shutdownTimeout: '2 seconds',
          });
          yield* use(queue, sent);
        }),
      );
      return sent;
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, client),
      Effect.provide(TestClock.layer()),
    ),
  );
};

it('waits for the interval, coalesces spans, and batches signals separately', async () => {
  const sent = await run((queue, sent) =>
    Effect.gen(function* () {
      queue.offerProvisionalSpan('a', trace('a'));
      queue.offerCompletedSpan('a', trace('a', true));
      queue.offerCompletedSpan('b', trace('b', true));
      queue.offer(log('one'));
      queue.offer(log('two'));
      yield* TestClock.adjust('99 millis');
      expect(sent).toEqual([]);
      yield* TestClock.adjust('1 millis');
      expect(sent.length).toBeGreaterThanOrEqual(1);
      yield* TestClock.adjust('100 millis');
      expect(sent).toHaveLength(2);
    }),
  );
  expect(sent.map((item) => item.body)).toEqual([
    {
      resourceSpans: [
        { id: 'a', completed: true },
        { id: 'b', completed: true },
      ],
    },
    { resourceLogs: [{ message: 'one' }, { message: 'two' }] },
  ]);
});

it('exports a long-running span before its later completion', async () => {
  const sent = await run((queue) =>
    Effect.gen(function* () {
      queue.offerProvisionalSpan('a', trace('a'));
      yield* TestClock.adjust('100 millis');
      queue.offerCompletedSpan('a', trace('a', true));
      yield* TestClock.adjust('100 millis');
    }),
  );
  expect(sent.map((item) => item.body.resourceSpans)).toEqual([
    [{ id: 'a', completed: false }],
    [{ id: 'a', completed: true }],
  ]);
});

it('flushes at the size limit and drains the remainder on shutdown', async () => {
  const sent = await run(
    (queue, sent) =>
      Effect.gen(function* () {
        queue.offer(log('one'));
        queue.offer(log('two'));
        yield* Effect.yieldNow;
        expect(sent).toHaveLength(1);
        queue.offer(log('three'));
        expect(sent).toHaveLength(1);
      }),
    2,
  );
  expect(sent.map((item) => item.body.resourceLogs)).toEqual([
    [{ message: 'one' }, { message: 'two' }],
    [{ message: 'three' }],
  ]);
});

it('keeps simultaneous layer buffers independent', async () => {
  const [first, second] = await Promise.all([
    run((queue) => Effect.sync(() => queue.offer(log('first')))),
    run((queue) => Effect.sync(() => queue.offer(log('second')))),
  ]);
  expect(first[0]?.body.resourceLogs).toEqual([{ message: 'first' }]);
  expect(second[0]?.body.resourceLogs).toEqual([{ message: 'second' }]);
});

it('rejects invalid batching settings', () => {
  for (const maxBatchSize of [0, -1, 1.5, Infinity, NaN])
    expect(() => makeDevTelemetryLayer({ maxBatchSize })).toThrow(RangeError);
  expect(() => makeDevTelemetryLayer({ batchInterval: '0 millis' })).toThrow(
    RangeError,
  );
});

it('bounds shutdown and interrupts an unresponsive collector', async () => {
  let interrupted = false;
  const client = HttpClient.make(() =>
    Effect.never.pipe(
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interrupted = true;
        }),
      ),
    ),
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.scoped(
        Effect.gen(function* () {
          const queue = yield* makeRequestQueue({
            batchInterval: '100 millis',
            maxBatchSize: 100,
            retries: 0,
            requestTimeout: '3 seconds',
            shutdownTimeout: '50 millis',
          });
          queue.offer(log('last message'));
        }),
      ).pipe(Effect.forkChild);
      yield* TestClock.adjust('50 millis');
      yield* Fiber.join(fiber);
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, client),
      Effect.provide(TestClock.layer()),
    ),
  );
  expect(interrupted).toBe(true);
});
