import { Effect, Stream } from 'effect';
import { DevtoolsRpc } from '../../rpc/index.js';
import { FlowEntitySchema } from '@pkishorez/lotel/flow';
import { LogEntitySchema, SpanEntitySchema } from '@pkishorez/lotel/telemetry';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { DecodedEntity } from 'std-toolkit/core';
import { createStdSync, syncStrategy } from 'std-toolkit/sync';
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
type FlowList = Rpc.Success<RpcByTag<'ListFlows'>>;
export type SpanRecord = SpanList['items'][number]['value'];
export type LogRecord = LogList['items'][number]['value'];
export type FlowRecord = FlowList['items'][number]['value'];
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
      { readonly items: readonly DecodedEntity<V>[] },
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

    return syncStrategy.newToOld<V>({
      // Finite backfill: page descending from the resume cursor toward the
      // oldest record, one `PAGE_SIZE` batch at a time. An empty page proves the
      // floor and ends the backfill.
      backfill: ({ paginated }) =>
        paginated({
          fetch: ({ cursor }) => fetchPage({ '<': cursor?.meta._u ?? null }),
        }),
      // Live tail: page forward strictly after the anchor in `PAGE_SIZE` chunks,
      // staying open. A full page means a backlog remains, so keep draining
      // without idling; only sleep once a short page proves we've caught up.
      tail: ({ live }) =>
        live({
          open: ({ cursor }) => {
            let anchor = cursor?.meta._u ?? null;
            return Stream.fromEffectRepeat(
              Effect.gen(function* () {
                const items = yield* fetchPage({ '>': anchor });
                if (items.length > 0) anchor = items[items.length - 1]!.meta._u;
                if (items.length < PAGE_SIZE)
                  yield* Effect.sleep(POLL_INTERVAL_MS);
                return items;
              }),
            );
          },
        }),
    });
  };

  const traces = std.collection({
    schema: SpanEntitySchema,
    sync: {
      total: {
        strategy: newToOldStrategy<SpanRecord>((client, query) =>
          client.ListSpans(query),
        ),
      },
    },
  });

  const logs = std.collection({
    schema: LogEntitySchema,
    sync: {
      total: {
        strategy: newToOldStrategy<LogRecord>((client, query) =>
          client.ListLogs(query),
        ),
      },
    },
  });

  const flows = std.collection({
    schema: FlowEntitySchema,
    sync: {
      total: {
        strategy: newToOldStrategy<FlowRecord>((client, query) =>
          client.ListFlows(query),
        ),
      },
    },
  });

  return { traces, logs, flows };
}

export type TelemetryCollections = ReturnType<typeof buildTelemetryCollections>;
