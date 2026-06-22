import { Effect, Stream } from 'effect';
import {
  LogRecordSchema,
  TraceRecordSchema,
  type StoredLogRecordValue,
  type StoredTraceRecordValue,
} from 'lotel/client';
import type { EntityType } from '@std-toolkit/core';
import { createStdSync, syncStrategy } from '@std-toolkit/tanstack-sync';
import { LotelClient, makeLotelClientLayer } from './runtime';

const POLL_INTERVAL_MS = 1000;

export function buildCollections(baseUrl: string) {
  const layer = makeLotelClientLayer(baseUrl);
  const std = createStdSync();

  const pollingStrategy = <V extends { id: string }>(
    queryPage: (
      client: Effect.Success<typeof LotelClient>,
      query: { cursor?: string },
    ) => Effect.Effect<{ readonly items: readonly unknown[] }, unknown, never>,
  ) =>
    syncStrategy.oldToNew<V>({
      stream: ({ cursor: initialCursor }) => {
        let cursor = initialCursor;
        return Effect.succeed(
          Stream.fromEffectRepeat(
            Effect.gen(function* () {
              const client = yield* LotelClient;
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
    strategy: pollingStrategy<StoredTraceRecordValue>((client, query) =>
      client.lotel.queryTraces({ query }),
    ),
  });

  const logs = std.collection({
    schema: LogRecordSchema,
    strategy: pollingStrategy<StoredLogRecordValue>((client, query) =>
      client.lotel.queryLogs({ query }),
    ),
  });

  return { traces, logs };
}

export type OtelCollections = ReturnType<typeof buildCollections>;
