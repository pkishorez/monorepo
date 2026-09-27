import { Effect } from 'effect';
import { DevtoolsRpc } from '../../rpc/index.js';
import { LogEntitySchema, SpanEntitySchema } from '@kstackz/lotel/telemetry';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { Entity } from '@kstackz/std-toolkit/core';
import { createStdSync, strategy } from '@kstackz/std-toolkit/sync';
import {
  DevtoolsClient,
  makeDevtoolsClientLayer,
} from '../../client/devtools-rpc/index.js';

const POLL_INTERVAL_MS = 1000;
const PAGE_SIZE = 20;

type RpcByTag<Tag extends string> = Extract<
  RpcGroup.Rpcs<typeof DevtoolsRpc>,
  { readonly _tag: Tag }
>;
type SpanList = Rpc.Success<RpcByTag<'ListSpans'>>;
type LogList = Rpc.Success<RpcByTag<'ListLogs'>>;
export type SpanRecord = SpanList['items'][number]['value'];
export type LogRecord = LogList['items'][number]['value'];
type UpdateCursor = Rpc.Payload<RpcByTag<'ListSpans'>>['_u'];

/**
 * Build the live Lotel collections backed by same-origin DevTools RPC.
 */
export function buildTelemetryCollections() {
  const layer = makeDevtoolsClientLayer();
  const std = createStdSync({ name: 'devtools-telemetry' });

  const newToOldStrategy = <V extends object>(
    queryPage: (
      client: Effect.Success<typeof DevtoolsClient>,
      query: { _u: UpdateCursor; limit?: number },
    ) => Effect.Effect<
      { readonly items: readonly Entity<V>[] },
      unknown,
      never
    >,
  ) => {
    const fetchPage = (_u: UpdateCursor) =>
      Effect.gen(function* () {
        const client = yield* DevtoolsClient;
        const res = yield* queryPage(client, { _u, limit: PAGE_SIZE });
        return res.items;
      }).pipe(Effect.provide(layer), Effect.orDie);

    // Newest first: show the latest page, fill in older pages in the
    // background, and poll for newer ones.
    return strategy.newToOld<V>({
      fetchOlder: ({ before }) => fetchPage({ '<': before?.meta._u ?? null }),
      fetch: ({ after }) => fetchPage({ '>': after?.meta._u ?? null }),
      pollEvery: POLL_INTERVAL_MS,
    });
  };

  const traces = std.collection(SpanEntitySchema, {
    sync: {
      global: newToOldStrategy<SpanRecord>((client, query) =>
        client.ListSpans(query),
      ),
    },
  });

  const logs = std.collection(LogEntitySchema, {
    sync: {
      global: newToOldStrategy<LogRecord>((client, query) =>
        client.ListLogs(query),
      ),
    },
  });

  return { traces, logs };
}

export type TelemetryCollections = ReturnType<typeof buildTelemetryCollections>;
