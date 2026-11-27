import { Effect } from 'effect';
import type { RpcClient, RpcClientError } from 'effect/rpc';
import type { Entity } from '@kestack/std-toolkit/core';
import { createStdSync, strategy } from '@kestack/std-toolkit/sync';
import {
  LogEntitySchema,
  SpanEntitySchema,
  type LogRecord,
  type TelemetryRpc,
  type SpanRecord,
  type UpdateCursor,
} from '../../../server/rpc/telemetry/contract/index.js';

const POLL_INTERVAL_MS = 1000;
const PAGE_SIZE = 20;

export type LotelClient = RpcClient.FromGroup<
  typeof TelemetryRpc,
  RpcClientError.RpcClientError
>;

type Page<V> = (query: {
  readonly _u: UpdateCursor;
  readonly limit: number;
}) => Effect.Effect<{ readonly items: ReadonlyArray<Entity<V>> }, unknown>;

const newToOld = <V extends object>(page: Page<V>) => {
  const fetchPage = (_u: UpdateCursor) =>
    page({ _u, limit: PAGE_SIZE }).pipe(
      Effect.map((result) => result.items),
      Effect.orDie,
    );
  return strategy.newToOld<V>({
    fetchOlder: ({ before }) => fetchPage({ '<': before?.meta._u ?? null }),
    fetch: ({ after }) => fetchPage({ '>': after?.meta._u ?? null }),
    pollEvery: POLL_INTERVAL_MS,
  });
};

export function openCollections(client: LotelClient, generation: number) {
  const std = createStdSync({ name: `lotel-telemetry-${generation}` });

  const spans = std.collection(SpanEntitySchema, {
    sync: {
      global: newToOld<SpanRecord>((query) => client.ListSpans(query)),
    },
  });

  const logs = std.collection(LogEntitySchema, {
    sync: {
      global: newToOld<LogRecord>((query) => client.ListLogs(query)),
    },
  });

  return { spans, logs, dispose: () => std.dispose() };
}

export type Collections = ReturnType<typeof openCollections>;
