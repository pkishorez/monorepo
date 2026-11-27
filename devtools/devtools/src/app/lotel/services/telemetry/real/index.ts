import { Effect, Layer, Queue, Stream, SubscriptionRef } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import {
  TELEMETRY_RPC_PATH,
  TelemetryRpc,
} from '../../../server/rpc/telemetry/contract/index.js';
import {
  Telemetry,
  type Live,
  type OtelEvent,
  type OtelSpan,
} from '../contract/index.js';
import { openCollections, type Collections } from './collections.js';
import { attachLogs, transformLog, transformSpan } from './normalization.js';

const watch = ({ spans, logs }: Collections) =>
  Stream.callback<Live>(
    (queue) =>
      Effect.gen(function* () {
        const spanRows = new Map<unknown, OtelSpan>();
        const logRows = new Map<
          unknown,
          { readonly span: string; readonly event: OtelEvent }
        >();

        const joinedRows = new WeakMap<
          OtelSpan,
          { readonly events: ReadonlyArray<OtelEvent>; readonly span: OtelSpan }
        >();
        const join = (span: OtelSpan, events: ReadonlyArray<OtelEvent>) => {
          const kept = joinedRows.get(span);
          if (
            kept &&
            kept.events.length === events.length &&
            kept.events.every((event, at) => event === events[at])
          )
            return kept.span;
          const joined = attachLogs(span, events);
          joinedRows.set(span, { events, span: joined });
          return joined;
        };

        const publish = () => {
          const logsBySpan = new Map<string, OtelEvent[]>();
          for (const { span, event } of logRows.values()) {
            const known = logsBySpan.get(span);
            if (known) known.push(event);
            else logsBySpan.set(span, [event]);
          }
          const joined = Array.from(spanRows.values(), (span) => {
            const own = logsBySpan.get(`${span.traceId}:${span.spanId}`);
            return own ? join(span, own) : span;
          });
          Queue.offerUnsafe(queue, { ready: spans.isReady(), spans: joined });
        };

        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const spanChanges = spans.subscribeChanges(
              (changes) => {
                for (const change of changes) {
                  if (change.type === 'delete') spanRows.delete(change.key);
                  else spanRows.set(change.key, transformSpan(change.value));
                }
                publish();
              },
              { includeInitialState: true },
            );
            const logChanges = logs.subscribeChanges(
              (changes) => {
                for (const change of changes) {
                  const { traceId, spanId } = change.value;
                  if (change.type === 'delete' || !traceId || !spanId)
                    logRows.delete(change.key);
                  else
                    logRows.set(change.key, {
                      span: `${traceId}:${spanId}`,
                      event: transformLog(change.value),
                    });
                }
                publish();
              },
              { includeInitialState: true },
            );
            const stopReady = spans.onFirstReady(publish);
            return () => {
              spanChanges.unsubscribe();
              logChanges.unsubscribe();
              stopReady();
            };
          }),
          (stop) => Effect.sync(stop),
        );
        publish();
      }),
    { bufferSize: 1, strategy: 'sliding' },
  );

const make = Effect.gen(function* () {
  const client = yield* RpcClient.make(TelemetryRpc);
  let generation = 0;
  const current = yield* SubscriptionRef.make(
    openCollections(client, generation),
  );
  const dispose = (collections: Collections) =>
    Effect.tryPromise(() => collections.dispose()).pipe(Effect.ignore);
  yield* Effect.addFinalizer(() =>
    SubscriptionRef.get(current).pipe(Effect.flatMap(dispose)),
  );

  return Telemetry.of({
    live: SubscriptionRef.changes(current).pipe(Stream.switchMap(watch)),
    clear: Effect.gen(function* () {
      const { deleted } = yield* client.ClearTelemetry({});
      const previous = yield* SubscriptionRef.get(current);
      generation += 1;
      yield* SubscriptionRef.set(current, openCollections(client, generation));
      yield* dispose(previous);
      return deleted;
    }),
  });
});

export const telemetryLayer = (origin: string) =>
  Layer.effect(Telemetry)(make).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: `${origin}${TELEMETRY_RPC_PATH}`,
      }).pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(FetchHttpClient.layer),
      ),
    ),
  );
