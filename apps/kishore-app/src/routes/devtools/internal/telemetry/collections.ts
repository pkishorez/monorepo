import { Effect, Stream } from 'effect';
import {
  LogRecordSchema,
  TraceRecordSchema,
  type StoredLogRecordValue,
  type StoredTraceRecordValue,
} from '@kishorez/lotel/client';
import type { EntityType } from 'std-toolkit/core';
import { createStdSync, syncStrategy } from 'std-toolkit/tanstack-sync';
import { DevtoolsClient, makeDevtoolsClientLayer } from '../runtime';

const POLL_INTERVAL_MS = 1000;

/**
 * Build the live Telemetry collections (traces, logs) backed by the DevTools
 * RPC client at `baseUrl`. Reads poll the umbrella `/rpc` surface; telemetry is
 * global, so no project is involved.
 */
export function buildTelemetryCollections(baseUrl: string) {
  const layer = makeDevtoolsClientLayer(baseUrl);
  const std = createStdSync();

  const pollingStrategy = <V extends { id: string }>(
    queryPage: (
      client: Effect.Success<typeof DevtoolsClient>,
      query: { cursor?: string },
    ) => Effect.Effect<{ readonly items: readonly unknown[] }, unknown, never>,
  ) =>
    syncStrategy.oldToNew<V>({
      stream: ({ cursor: initialCursor }) => {
        let cursor = initialCursor;
        return Effect.succeed(
          Stream.fromEffectRepeat(
            Effect.gen(function* () {
              const client = yield* DevtoolsClient;
              const query: { cursor?: string } = {};
              if (cursor?.value.id) query.cursor = cursor.value.id;
              const res = yield* queryPage(client, query);
              const items = res.items as EntityType<V>[];
              if (items.length > 0) cursor = items[items.length - 1]!;
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
      strategy: pollingStrategy<StoredTraceRecordValue>((client, query) =>
        client.QueryTraces(query),
      ),
      forwardFetch: () => Effect.succeed([]),
      cadence: false,
    },
  });

  const logs = std.collection({
    schema: LogRecordSchema,
    sync: {
      strategy: pollingStrategy<StoredLogRecordValue>((client, query) =>
        client.QueryLogs(query),
      ),
      forwardFetch: () => Effect.succeed([]),
      cadence: false,
    },
  });

  return { traces, logs };
}

export type TelemetryCollections = ReturnType<typeof buildTelemetryCollections>;
