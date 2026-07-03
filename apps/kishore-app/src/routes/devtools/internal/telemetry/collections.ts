import { Effect, Stream } from 'effect';
import {
  LogRecordSchema,
  TraceRecordSchema,
  type StoredLogRecordValue,
  type StoredTraceRecordValue,
  type TelemetryQuery,
} from '@kishorez/lotel/client';
import type { EntityType } from 'std-toolkit/core';
import { createStdSync, syncStrategy } from 'std-toolkit/tanstack-sync';
import { DevtoolsClient, makeDevtoolsClientLayer } from '../runtime';

const POLL_INTERVAL_MS = 1000;
const PAGE_SIZE = 20;

/**
 * Build the live Telemetry collections (traces, logs) backed by the DevTools
 * RPC client at `baseUrl`. Reads poll the umbrella `/rpc` surface; telemetry is
 * global, so no project is involved.
 */
export function buildTelemetryCollections(baseUrl: string) {
  const layer = makeDevtoolsClientLayer(baseUrl);
  const std = createStdSync();

  const newToOldStrategy = <V extends { id: string }>(
    queryPage: (
      client: Effect.Success<typeof DevtoolsClient>,
      query: { sk: TelemetryQuery; limit?: number },
    ) => Effect.Effect<{ readonly items: readonly unknown[] }, unknown, never>,
  ) =>
    syncStrategy.newToOld<V>({
      // Finite backfill: page descending from the resume cursor toward the
      // oldest record, one `PAGE_SIZE` batch at a time, ending when a short page
      // proves the floor. `null` state stops the stream.
      subscribeOlder: ({ cursor }) =>
        Effect.succeed(
          Stream.unfold(
            (cursor?.value.id
              ? { '<=': cursor.value.id }
              : { '<': null }) as TelemetryQuery | null,
            (sk) =>
              Effect.gen(function* () {
                if (sk === null) return undefined;
                const client = yield* DevtoolsClient;
                const res = yield* queryPage(client, { sk, limit: PAGE_SIZE });
                const items = res.items as EntityType<V>[];
                if (items.length === 0) return undefined;
                // Descending: items[last] is the oldest of the page. Reaching a
                // short page means no older records remain — emit it, then stop.
                const oldest = items[items.length - 1]!.value.id;
                const next: TelemetryQuery | null =
                  items.length < PAGE_SIZE ? null : { '<': oldest };
                return [items, next] as const;
              }).pipe(Effect.provide(layer), Effect.orDie),
          ),
        ),
      // Live tail: page forward strictly after the anchor in `PAGE_SIZE` chunks,
      // staying open. A full page means a backlog remains, so keep draining
      // without idling; only sleep once a short page proves we've caught up.
      subscribeNewer: ({ cursor }) => {
        let anchor = cursor?.value.id ?? null;
        return Effect.succeed(
          Stream.fromEffectRepeat(
            Effect.gen(function* () {
              const client = yield* DevtoolsClient;
              const res = yield* queryPage(client, {
                sk: { '>=': anchor },
                limit: PAGE_SIZE,
              });
              const items = res.items as EntityType<V>[];
              if (items.length > 0) anchor = items[items.length - 1]!.value.id;
              if (items.length < PAGE_SIZE)
                yield* Effect.sleep(POLL_INTERVAL_MS);
              return items;
            }).pipe(Effect.provide(layer), Effect.orDie),
          ),
        );
      },
    });

  const traces = std.collection({
    schema: TraceRecordSchema,
    sync: {
      strategy: newToOldStrategy<StoredTraceRecordValue>((client, query) =>
        client.QueryTraces(query),
      ),
      forwardFetch: () => Effect.succeed([]),
      cadence: false,
    },
  });

  const logs = std.collection({
    schema: LogRecordSchema,
    sync: {
      strategy: newToOldStrategy<StoredLogRecordValue>((client, query) =>
        client.QueryLogs(query),
      ),
      forwardFetch: () => Effect.succeed([]),
      cadence: false,
    },
  });

  return { traces, logs };
}

export type TelemetryCollections = ReturnType<typeof buildTelemetryCollections>;
