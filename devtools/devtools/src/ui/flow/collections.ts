import { Effect } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';
import type { Entity } from 'std-toolkit/core';
import { createStdSync, strategy } from 'std-toolkit/sync';
import {
  DevtoolsClient,
  makeDevtoolsClientLayer,
} from '../../client/devtools-rpc/index.js';
import { DevtoolsRpc, FlowEntryEntitySchema } from '../../rpc/index.js';
import type { FlowEntryRecord } from '../../rpc/index.js';

const POLL_INTERVAL_MS = 250;
const PAGE_SIZE = 200;

type RpcByTag<Tag extends string> = Extract<
  RpcGroup.Rpcs<typeof DevtoolsRpc>,
  { readonly _tag: Tag }
>;
type FlowCursor = Rpc.Payload<RpcByTag<'ListFlowEntries'>>['_u'];

/** Turns the wire form of one stored Entry into the row the collection keeps. */
const toEntity = (item: {
  readonly entry: FlowEntryRecord['entry'];
  readonly _u: string;
}): Entity<FlowEntryRecord> => ({
  value: { id: item.entry.id, flowId: item.entry.flowId, entry: item.entry },
  meta: {
    _e: 'FlowEntry',
    _v: FlowEntryEntitySchema.latestVersion,
    _d: false,
    _u: item._u,
  },
});

/** Builds the live Flow Entry collection backed by same-origin DevTools RPC. */
export function buildFlowCollections() {
  const layer = makeDevtoolsClientLayer();
  const std = createStdSync({ name: 'devtools-flow' });

  const fetchPage = (_u: FlowCursor) =>
    Effect.gen(function* () {
      const client = yield* DevtoolsClient;
      const { items } = yield* client.ListFlowEntries({ _u, limit: PAGE_SIZE });
      return items.map(toEntity);
    }).pipe(Effect.provide(layer), Effect.orDie);

  const entries = std.collection(FlowEntryEntitySchema, {
    sync: {
      // Newest first: show the latest page, fill in older pages in the
      // background, and poll for newer ones.
      global: strategy.newToOld<FlowEntryRecord>({
        fetchOlder: ({ before }) => fetchPage({ '<': before?.meta._u ?? null }),
        fetch: ({ after }) => fetchPage({ '>': after?.meta._u ?? null }),
        pollEvery: POLL_INTERVAL_MS,
      }),
    },
  });

  return { entries };
}

export type FlowCollections = ReturnType<typeof buildFlowCollections>;
