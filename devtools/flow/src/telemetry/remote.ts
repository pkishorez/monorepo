import { Cause, Duration, Effect, Fiber, Layer, Queue } from 'effect';
import {
  DEFAULT_FLOW_ENDPOINT,
  FlowRpcClient,
  makeFlowRpcClientLayer,
} from '../client/index.js';
import type { Entry } from '../journal/index.js';
import {
  FlowTelemetry,
  makeSinkBase,
  type RemoteFlowTelemetry,
} from './telemetry.js';

export interface RemoteFlowTelemetryOptions {
  /**
   * The DevTools origin hosting the Flow Store.
   *
   * @default 'http://127.0.0.1:14400'
   */
  readonly endpoint?: string | undefined;
  readonly origin?: string | undefined;
  /** @default 100 millis */
  readonly batchInterval?: Duration.Input | undefined;
  /** @default 100 */
  readonly maxBatchSize?: number | undefined;
  /** @default 2 */
  readonly retries?: number | undefined;
  /** @default 3 seconds */
  readonly requestTimeout?: Duration.Input | undefined;
  /** @default 2 seconds */
  readonly shutdownTimeout?: Duration.Input | undefined;
}

/**
 * Records every Flow in the runtime to the Flow Store at `endpoint`. Entries
 * are batched, retried, and drained on shutdown; when the store is
 * unreachable the batch is dropped with one warning, and the program never
 * fails because of telemetry.
 */
export const layer = (options: RemoteFlowTelemetryOptions = {}) => {
  const endpoint = options.endpoint ?? DEFAULT_FLOW_ENDPOINT;
  const batchInterval = options.batchInterval ?? Duration.millis(100);
  const maxBatchSize = options.maxBatchSize ?? 100;
  const retries = Math.max(0, options.retries ?? 2);
  const requestTimeout = options.requestTimeout ?? Duration.seconds(3);
  const shutdownTimeout = options.shutdownTimeout ?? Duration.seconds(2);
  if (!Number.isSafeInteger(maxBatchSize) || maxBatchSize <= 0) {
    throw new RangeError('maxBatchSize must be a positive integer');
  }

  return Layer.effect(
    FlowTelemetry,
    Effect.gen(function* () {
      const client = yield* FlowRpcClient;
      const queue = yield* Queue.unbounded<readonly Entry[], Cause.Done>();
      let pending: Entry[] = [];
      let closed = false;
      let warned = false;

      const flush = () => {
        if (pending.length === 0) return;
        const batch = pending;
        pending = [];
        Queue.offerUnsafe(queue, batch);
      };

      const send = (entries: readonly Entry[]) =>
        client.WriteFlowEntries({ entries }).pipe(
          Effect.timeout(requestTimeout),
          Effect.retry({ times: retries }),
          Effect.catchCause(() =>
            Effect.sync(() => {
              if (warned) return;
              warned = true;
              console.warn(
                `[flow] Dropped ${entries.length} entries: the Flow Store at ${endpoint} is unreachable.`,
              );
            }),
          ),
          Effect.withTracerEnabled(false),
        );

      const worker = yield* Queue.take(queue).pipe(
        Effect.flatMap(send),
        Effect.forever,
        Effect.catchCause(() => Effect.void),
        Effect.forkScoped({ startImmediately: true }),
      );

      const timer = yield* Effect.sleep(batchInterval).pipe(
        Effect.andThen(Effect.sync(flush)),
        Effect.forever,
        Effect.forkScoped({ startImmediately: true }),
      );

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          closed = true;
          yield* Fiber.interrupt(timer);
          flush();
          yield* Queue.end(queue);
          yield* Fiber.await(worker);
        }).pipe(
          Effect.interruptible,
          Effect.timeoutOption(shutdownTimeout),
          Effect.asVoid,
        ),
      );

      return {
        kind: 'remote',
        endpoint,
        ...makeSinkBase(options.origin),
        write: (entry) => {
          if (closed) return;
          pending.push(entry);
          if (pending.length >= maxBatchSize) flush();
        },
      } satisfies RemoteFlowTelemetry;
    }),
  ).pipe(Layer.provide(makeFlowRpcClientLayer({ endpoint })));
};
