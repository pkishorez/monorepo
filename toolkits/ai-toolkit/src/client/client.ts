import { Context, Effect, Layer, Schema, Stream } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import {
  client,
  keepSubscribed,
  status,
  type ConnectionStatus,
} from '@kestack/rpc-toolkit/rpc/websocket';
import type { Entity } from '@kestack/std-toolkit/core';
import { oldToNew, Replica, Replicas } from '@kestack/std-toolkit/replica';
import { AiApi, type WireEntity } from '../api/contract/index.js';
import { MessageSchema, PROJECTION_VERSION } from '../projection/index.js';
import { ProjectSchema, SessionSchema } from '../records/index.js';

/*
 * What an app needs to talk to an ai-toolkit server, a Machine: the API over
 * one WebSocket, and a Replica that keeps its projects, sessions and the
 * messages of each open session in step with the server, one Instance per
 * Machine.
 *
 * A browser can set no header on a WebSocket but `Sec-WebSocket-Protocol`,
 * so the Machine Key rides there: the socket offers `ai-toolkit` and
 * `key.<key>`, and the server selects `ai-toolkit` once the key checks out.
 *
 * The socket reconnects on its own. A feed open when it dropped goes quiet,
 * so each one is opened again on every reconnect, from the newest entity it
 * has passed on: the server replays everything after it, then goes live,
 * and nothing is missed or sent twice. Commands sent while disconnected
 * wait for the connection.
 */

export class AiClient extends Context.Service<
  AiClient,
  RpcClient.FromGroup<typeof AiApi, RpcClientError.RpcClientError>
>()('@kestack/ai-toolkit/AiClient') {
  /**
   * The API at `url`, an absolute `ws(s)://…/rpc` or a path in a browser,
   * proving itself with the Machine's `key` when given one.
   */
  static readonly layer = (
    url: string,
    options?: { readonly key?: string | undefined },
  ) =>
    Layer.effect(AiClient, RpcClient.make(AiApi)).pipe(
      Layer.provideMerge(
        client(AiApi, {
          url,
          protocols:
            options?.key === undefined
              ? undefined
              : ['ai-toolkit', `key.${options.key}`],
        }),
      ),
    );
}

/** The connection now, then each change: `connecting`, `connected` or `reconnecting`. */
export const connection = status;
export type { ConnectionStatus };

type Wire = Entity<unknown>;

const newer = (current: Wire | null, batch: ReadonlyArray<Wire>) =>
  batch.reduce<Wire | null>(
    (newest, entity) =>
      newest === null || entity.meta._u > newest.meta._u ? entity : newest,
    current,
  );

/**
 * A feed that survives reconnects. The Replica hands over its cursor once,
 * as the feed opens; each reopen after a reconnect starts from the newest
 * entity this feed has passed on since, not from that first cursor.
 */
const resumable =
  (
    open: (
      api: AiClient['Service'],
      after: WireEntity | null,
    ) => Stream.Stream<ReadonlyArray<WireEntity>, unknown>,
  ) =>
  ({ after }: { readonly after: Wire | null }) =>
    Stream.unwrap(
      Effect.map(AiClient, (api) => {
        let cursor = after;
        return keepSubscribed(() => open(api, cursor)).pipe(
          Stream.tap((batch) =>
            Effect.sync(() => {
              cursor = newer(cursor, batch);
            }),
          ),
        );
      }),
    );

/*
 * A device keeps Messages as the projection made them, so the Replica's
 * name carries the projection's version: a new projection is a new Replica,
 * synced afresh, and the old ones are `retired` for the Store to delete.
 * `ai-m…` is keyed by Machine; the `ai` and `ai-p…` before it held one
 * server's records, unkeyed, and are all retired.
 */
const replicaName = (version: number) => `ai-m${version}`;
const unkeyedVersions = 3;

/** Replicas no longer read, for `Store.idb({ retired })`. */
export const retired: ReadonlyArray<string> = [
  'ai',
  ...Array.from({ length: unkeyedVersions }, (_, at) => `ai-p${at + 1}`),
  ...Array.from({ length: PROJECTION_VERSION - 1 }, (_, at) =>
    replicaName(at + 1),
  ),
];

/**
 * The records of each Machine: `Ai.get(machineId)` is the Instance of one
 * Machine, kept in its own IndexedDB database.
 */
export const Ai = Replica.make(replicaName(PROJECTION_VERSION), {
  key: Schema.String,
  collections: {
    projects: ProjectSchema,
    sessions: SessionSchema,
    messages: MessageSchema,
  },
});

/**
 * A Replica Build, as `Replicas.child` takes it. std-toolkit does not export
 * its `Build` type, so this is as precisely as a published type can name
 * it: what it needs from the app's Layer (`AiClient.layer`) is not checked.
 */
export type AiBuild = Parameters<typeof Replicas.child>[0][number];

/**
 * How `Ai` syncs: every project and session while the app runs, and the
 * messages of a session while a Query filters on its `sessionId`. Place it
 * with `Replicas.child([AiLive])`, and give the app the `AiClient.layer` of
 * the Machine it is on: every Instance syncs through that one client, so
 * only the Instance of that Machine should be held.
 */
export const AiLive: AiBuild = Replica.build(Ai, {
  gcTime: '30 seconds',
  collections: {
    projects: {
      strategy: oldToNew({
        subscribe: resumable((api, after) => api.projects({ after })),
      }),
    },
    sessions: {
      strategy: oldToNew({
        subscribe: resumable((api, after) => api.sessions({ after })),
      }),
    },
    messages: {
      windows: {
        sessionId: (sessionId) =>
          oldToNew({
            subscribe: resumable((api, after) =>
              api.messages({ sessionId: String(sessionId), after }),
            ),
          }),
      },
    },
  },
});
