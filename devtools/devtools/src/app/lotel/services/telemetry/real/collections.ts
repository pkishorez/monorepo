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

/*
 * The Span Records and Log Records the DevTools Server keeps, copied into
 * two TanStack DB collections and kept live: the newest page first, older
 * pages filled in behind it, and newer ones asked for every second.
 */

const POLL_INTERVAL_MS = 1000;
const PAGE_SIZE = 20;

export type LotelClient = RpcClient.FromGroup<
  typeof TelemetryRpc,
  RpcClientError.RpcClientError
>;

/** One page of Entities after or before an Update Cursor. */
type Page<V> = (query: {
  readonly _u: UpdateCursor;
  readonly limit: number;
}) => Effect.Effect<{ readonly items: ReadonlyArray<Entity<V>> }, unknown>;

// Newest first: show the latest page, fill in older pages in the
// background, and poll for newer ones.
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

/**
 * The live collections, read through `client`. Each opening is a Std Sync
 * of its own, named by `generation`, so one opened after a clear starts
 * empty rather than from the copy the clear threw away.
 */
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
