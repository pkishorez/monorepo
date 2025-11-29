import * as RpcClient from '@effect/rpc/RpcClient';
import { RpcSerialization } from '@effect/rpc';
import { RpcClientError } from '@effect/rpc/RpcClientError';
import type {
  FromClientEncoded,
  FromServerEncoded,
} from '@effect/rpc/RpcMessage';
import { Effect, Layer, Queue, Schedule, Ref, Duration, Console } from 'effect';
import { Socket } from '@effect/platform';
import { ping, pong } from './hybernation.js';

// Configuration for our robust protocol
interface RobustProtocolConfig {
  readonly url: string;
  onJsonResponse?: (data: any) => void;
  isCustomResponse?: (data: any) => boolean;
  onOpen?: () => void;
  readonly heartbeatInterval?: Duration.DurationInput; // e.g. "10 seconds"
  readonly heartbeatTimeout?: Duration.DurationInput; // e.g. "3 seconds"
}

export const makeRobustProtocol = ({
  url,
  onJsonResponse,
  isCustomResponse = (data) => data?._tag?.startsWith('std-toolkit'),
  onOpen,
  heartbeatInterval = '10 seconds',
  heartbeatTimeout = '3 second',
}: RobustProtocolConfig) =>
  Layer.scoped(
    RpcClient.Protocol,
    Effect.gen(function* () {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.unsafeMake();
      const websocketConstructor = yield* Socket.WebSocketConstructor;

      // 1. THE BUFFER (Guaranteed Delivery)
      // We create an unbounded queue to hold messages while offline.
      // When connected, the Writer pulls from this.
      const sendQueue = yield* Queue.unbounded<string>();

      // 2. THE PONG TRACKER
      // We need a way to tell the Pinger "We got a pong!"
      // A generic Ref that stores the timestamp of the last activity or a simple signal.
      // Here we use a specialized helper to track liveness.
      const lastActivity = yield* Ref.make(Date.now());

      // 3. THE CONNECTION MANAGER
      // This effect runs the socket lifecycle. If it fails, we retry it.
      const runConnection = (
        notifyRpcClient: (response: FromServerEncoded) => Effect.Effect<void>,
      ) =>
        Effect.gen(function* () {
          yield* Effect.log('Reconnecting to WebSocket...');
          const socket = yield* Socket.makeWebSocket(url);
          const writer = yield* socket.writer;

          // --- A. THE PINGER ---
          const pinger = Effect.gen(function* () {
            if (
              Duration.greaterThan(
                Duration.decode(heartbeatTimeout),
                Duration.millis(Date.now() - (yield* lastActivity.get)),
              )
            ) {
              return;
            }
            // Send Ping
            yield* writer(ping);

            // Wait for Pong (or any activity) within timeout
            const now = Date.now();
            yield* Effect.sleep(heartbeatTimeout);
            const last = yield* Ref.get(lastActivity);

            // If no activity since we sent the ping (approx), we consider it dead
            if (last <= now) {
              yield* Effect.fail(
                new RpcClientError({
                  reason: 'Protocol',
                  message: 'Heartbeat timeout: Connection Dead',
                }),
              );
            }
          }).pipe(Effect.repeat(Schedule.spaced(heartbeatInterval)));

          // --- B. THE WRITER (Queue Drainer) ---
          // Pulls from the persistent queue and writes to the CURRENT socket.
          // If this fails, the connection is torn down, but the Queue remains intact.
          const queueDrainer = Queue.take(sendQueue).pipe(
            Effect.flatMap((msg) => writer(msg)),
            Effect.forever,
          );

          // --- C. THE READER ---
          const reader = socket.runRaw(
            (data) =>
              Effect.gen(function* () {
                try {
                  yield* Ref.set(lastActivity, Date.now());

                  if (data === pong) {
                    return;
                  }

                  const decoded = parser.decode(data) as any[];
                  return yield* Effect.forEach(
                    decoded,
                    (msg) => {
                      const isCustom = isCustomResponse(msg);
                      if (isCustom) {
                        onJsonResponse?.(msg);
                        return Effect.void;
                      } else {
                        return notifyRpcClient(msg);
                      }
                    },
                    { discard: true },
                  );
                } catch {
                  yield* Console.log(
                    'Deserialization error\n',
                    JSON.stringify(data),
                  );
                }
              }),
            {
              onOpen: Effect.gen(function* () {
                // Setup any subscriptions or initial messages here
                yield* Effect.log('WebSocket connection established.');
                onOpen?.();
              }),
            },
          );

          // Run all sub-processes. If any fails (Pinger timeout or Socket error),
          // everything cancels and we return failure (triggering retry).
          yield* Effect.all([pinger, queueDrainer, reader], {
            concurrency: 'unbounded',
            discard: true,
          });
        }).pipe(
          // Retry policy for the connection itself
          Effect.retry(
            Schedule.exponential('500 millis').pipe(
              Schedule.union(Schedule.spaced('3 seconds')), // Cap at 10s
            ),
          ),
          // Crucial: If retry passes, we must ensure we don't actually "finish"
          // The protocol expects run to hang forever until interruption
          Effect.andThen(Effect.never),
          Effect.provideService(
            Socket.WebSocketConstructor,
            websocketConstructor,
          ),
          Effect.orDie,
          Effect.scoped,
        );

      return RpcClient.Protocol.of({
        supportsAck: false, // Can be true if backend supports it
        supportsTransferables: false,

        // When RPC Client wants to send, we just enqueue.
        // This succeeds immediately, ensuring "Fire and Forget" reliability.
        send: (request: FromClientEncoded) =>
          Effect.sync(() => {
            const encoded = parser.encode(request);
            if (typeof encoded === 'string') {
              // We use unsafe offer to be sync, unbounded queue won't block
              Queue.unsafeOffer(sendQueue, encoded);
            }
          }),

        // This starts the infinite connection loop
        run: (fn) => runConnection(fn),
      });
    }),
  ).pipe(Layer.provide(RpcSerialization.layerJson));
