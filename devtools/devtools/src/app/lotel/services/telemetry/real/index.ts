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

/*
 * Telemetry, from the DevTools Server at `origin`:
 *
 * 1. Live   every Span the server keeps, each with the Log Records that name
 *           it, now and after every change. Kept live by the TanStack DB
 *           collections in `collections.ts`, which nothing outside this
 *           folder sees: an Actor's Worker reads the Stream and Sends what
 *           it gives as a Message.
 * 2. Clear  deletes every Span Record and Log Record on the server, then
 *           opens the collections anew, so whoever reads the live Stream is
 *           switched to an empty copy rather than one still holding what
 *           was cleared.
 */

// 1. Live
/** One opening of the collections, as Live values, until it is switched away from. */
const watch = ({ spans, logs }: Collections) =>
  Stream.callback<Live>(
    (queue) =>
      Effect.gen(function* () {
        // Each row is made a Span or a Log Record once, when it changes.
        const spanRows = new Map<unknown, OtelSpan>();
        const logRows = new Map<
          unknown,
          { readonly span: string; readonly event: OtelEvent }
        >();

        // A Span with its Log Records, kept while neither changes, so a
        // reader can tell what did change by identity alone.
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
                  // A Log Record that names no Span has no Span to sit under.
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
    // A reader that falls behind gets only the latest.
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
    // 2. Clear
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

/** The telemetry of the DevTools Server at `origin`, over its Telemetry RPC. */
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
