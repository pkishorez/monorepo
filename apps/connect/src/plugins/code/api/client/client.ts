import { Context, Effect, Layer, Schema, Stream } from 'effect';
import {
  keepSubscribed,
  type connection as RpcConnection,
} from '@kestack/rpc-toolkit/rpc/websocket';
import type { Entity } from '@kestack/std-toolkit/core';
import { oldToNew, Replica, Replicas } from '@kestack/std-toolkit/replica';
import { CodeApi, type WireEntity } from '../contract/index.js';
import {
  link,
  PluginClients,
  pluginSocket,
  type Address,
  type LinkStatus,
  type PluginApi,
} from '../../../link/index.js';
import {
  MessageSchema,
  PROJECTION_VERSION,
} from '@kestack/ai-toolkit/contract';
import { ProjectSchema, SessionSchema } from '../../records/index.js';

export { link, type Address, type LinkStatus };

/*
 * What Code needs to talk to the code Plugin on its Connections: each
 * Connection's API over that Connection's own WebSocket, and a Replica that keeps
 * every Connection's projects, sessions and the messages of each open session
 * in step with it, one Instance per Connection, each syncing through its own
 * Connection's socket. Finding, opening and linking a socket is the same
 * for every Plugin: `PluginClients`, in `plugins/link`.
 *
 * 1. Find     a Connection by its id: `ConnectionAddress`, which the app gives,
 *             says where its socket is and which Connection Key it asks for,
 *             again before every connect. The app names the Release of the
 *             code Plugin it was built with in that address,
 *             `<tunnel>/code/<sha256>/rpc` (`pluginPath`).
 * 2. Open     `CodeClients` opens one socket per Connection the first time
 *             anything holds it, an Instance's Strategies or a call, and
 *             shares it with every other holder. A Connection running
 *             another Release closes it with `PLUGIN_MISMATCH`: until a
 *             socket to it is answered again, its Link is not linked, and
 *             `CodeClients.mismatch` says which Release it runs.
 * 3. Sync     `CodeReplicaLive` finds each Instance's socket by its Key, the
 *             Connection id: no Connection's socket ever feeds another's records.
 *
 * The socket reconnects on its own. A feed open when it dropped goes quiet,
 * so each one is opened again on every reconnect, from the newest entity it
 * has passed on: the server replays everything after it, then goes live,
 * and nothing is missed or sent twice. Commands sent while the socket is
 * down wait for it.
 */

export class CodeClient extends Context.Service<
  CodeClient,
  PluginApi<typeof CodeApi>
>()('@kestack/connect/CodeClient') {
  /**
   * The API at `url`, an absolute `ws(s)://…/code/<sha256>/rpc` or a path in a browser,
   * proving itself with the Connection's `key` when given one.
   */
  static readonly layer = (
    url: string,
    options?: { readonly key?: string | undefined },
  ) => pluginSocket(CodeClient, CodeApi, { url, key: options?.key });
}

// 1. Find
/**
 * Where each Connection's code Plugin is, by its id: the app gives it.
 * `of` is run before every connect, and may wait, for as long as it takes,
 * until the Connection can be reached.
 */
export class ConnectionAddress extends Context.Service<
  ConnectionAddress,
  { readonly of: (connectionId: string) => Effect.Effect<Address> }
>()('@kestack/connect/ConnectionAddress') {}

/** One Connection's API and its socket, as `CodeClients` holds them. */
export type ConnectionClient = Context.Context<CodeClient | RpcConnection>;

// 2. Open
/**
 * Every Connection's client, by Connection id. `hold` gives a Connection's API and
 * its socket for as long as the Scope lasts; the first holder opens it, and
 * it closes once nothing has held it for a while.
 */
export class CodeClients extends PluginClients<CodeClients>()(
  '@kestack/connect/CodeClients',
  CodeApi,
  CodeClient,
) {
  /** Each Connection's socket at the address `ConnectionAddress` gives for its id. */
  static readonly layer: Layer.Layer<CodeClients, never, ConnectionAddress> =
    Layer.unwrap(Effect.map(ConnectionAddress, ({ of }) => CodeClients.at(of)));
}

type Wire = Entity<unknown>;

const newer = (current: WireEntity | null, batch: ReadonlyArray<WireEntity>) =>
  batch.reduce<WireEntity | null>(
    (newest, entity) =>
      newest === null || entity.meta._u > newest.meta._u ? entity : newest,
    current,
  );

/**
 * A feed that survives reconnects, over the socket of the Instance's own
 * Connection, its Key. The Replica hands over its cursor once, as the feed
 * opens; each reopen after a reconnect starts from the newest entity this
 * feed has passed on since, not from that first cursor.
 */
const resumable =
  (
    open: (
      api: CodeClient['Service'],
      after: WireEntity | null,
    ) => Stream.Stream<ReadonlyArray<WireEntity>, unknown>,
  ) =>
  ({ key, after }: { readonly key: string; readonly after: Wire | null }) =>
    CodeClients.stream(
      key,
      Stream.unwrap(
        Effect.map(CodeClient, (api) => {
          // The Replica's cursor is an entity a feed sent: never empty.
          let cursor = after as WireEntity | null;
          return keepSubscribed(() => open(api, cursor)).pipe(
            Stream.tap((batch) =>
              Effect.sync(() => {
                cursor = newer(cursor, batch);
              }),
            ),
          );
        }),
      ),
    );

/*
 * A device keeps Messages as the projection made them, so the Replica's
 * name carries the projection's version: a new projection is a new Replica,
 * synced afresh. An app prunes its Store to `CodeReplica` alone, so the older ones
 * go without being named.
 */
const replicaName = (version: number) => `ai-m${version}`;

/**
 * The records of each Connection: `CodeReplica.get(connectionId)` is the Instance of one
 * Connection, kept in its own IndexedDB database.
 */
export const CodeReplica = Replica.make(replicaName(PROJECTION_VERSION), {
  key: Schema.String,
  collections: {
    projects: ProjectSchema,
    sessions: SessionSchema,
    messages: MessageSchema,
  },
});

/**
 * A Replica Build, as `Replicas.actor` takes it. std-toolkit does not export
 * its `Build` type, so this is as precisely as a published type can name
 * it: what it needs from the app's Layer (`CodeClients.layer`) is not checked.
 */
export type CodeReplicaBuild = Parameters<typeof Replicas.actor>[0][number];

/**
 * How `CodeReplica` syncs: every project and session while the app runs, and the
 * messages of a session while a Query filters on its `sessionId`, each
 * Instance over its own Connection's socket, found by its Key. Place it with
 * `Actor.child(Replicas.actor([CodeReplicaLive]))`, and give the app
 * `CodeClients`, which opens each Connection's socket at the address
 * `ConnectionAddress` gives.
 */
export const CodeReplicaLive: CodeReplicaBuild = Replica.build(CodeReplica, {
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
