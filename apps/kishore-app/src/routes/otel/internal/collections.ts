import { createCollection } from '@tanstack/react-db';
import { Effect } from 'effect';
import {
  LogRecordSchema,
  TraceRecordSchema,
  type StoredLogRecordValue,
  type StoredTraceRecordValue,
} from 'lotel/client';
import type { EntityType } from '@std-toolkit/core';
import { createStdSync } from '@std-toolkit/tanstack-sync';
import { LotelClient, makeLotelClientLayer } from './runtime';

export function buildCollections(baseUrl: string) {
  const layer = makeLotelClientLayer(baseUrl);
  const std = createStdSync();

  const traces = createCollection(
    std.totalSync({
      schema: TraceRecordSchema,
      query: ({ getCursor }) =>
        Effect.gen(function* () {
          const cursor = yield* getCursor;
          const client = yield* LotelClient;
          const urlParams: { cursor?: string } = {};
          if (cursor?.value.id) urlParams.cursor = cursor.value.id;
          const res = yield* client.lotel.queryTraces({ urlParams });
          return res.items as EntityType<StoredTraceRecordValue>[];
        }).pipe(Effect.provide(layer), Effect.orDie),
    }),
  );

  const logs = createCollection(
    std.totalSync({
      schema: LogRecordSchema,
      query: ({ getCursor }) =>
        Effect.gen(function* () {
          const cursor = yield* getCursor;
          const client = yield* LotelClient;
          const urlParams: { cursor?: string } = {};
          if (cursor?.value.id) urlParams.cursor = cursor.value.id;
          const res = yield* client.lotel.queryLogs({ urlParams });
          return res.items as EntityType<StoredLogRecordValue>[];
        }).pipe(Effect.provide(layer), Effect.orDie),
    }),
  );

  return { traces, logs };
}

export type OtelCollections = ReturnType<typeof buildCollections>;
