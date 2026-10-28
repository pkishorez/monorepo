import { Context, Effect, Layer, RcMap, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { RpcClient, type RpcClientError } from 'effect/rpc';
import {
  client,
  connection as RpcConnection,
  keepSubscribed,
  status,
  type ConnectionStatus,
} from '@kestack/rpc-toolkit/rpc/websocket';
import type { Entity } from '@kestack/std-toolkit/core';
import { oldToNew, Replica, Replicas } from '@kestack/std-toolkit/replica';
import { CodeApi, type WireEntity } from '../contract/index.js';
import {
  versionedClient,
  type VersionGap,
} from '../../../../cloud/contract/index.js';
import {
  MessageSchema,
  PROJECTION_VERSION,
} from '@kestack/ai-toolkit/contract';
import { ProjectSchema, SessionSchema } from '../../records/index.js';

/*
 * What Code needs to talk to the code Plugin on its Connections: each
 * Connection's API over that Connection's own WebSocket, and a Replica that keeps
 * every Connection's projects, sessions and the messages of each open session
 * in step with it, one Instance per Connection, each syncing through its own
 * Connection's socket.
 *
 * 1. Find     a Connection by its id: `ConnectionAddress`, which the app gives,
 *             says where its socket is and which Connection Key it asks for,
 *             again before every connect, so a Connection that comes back at
 *             a new address is reached there.
 * 2. Open     `CodeClients` opens one socket per Connection the first time
 *             anything holds it, an Instance's Strategies or a call, and
 *             shares it with every other holder; it closes a while after
 *             the last lets go.
 * 3. Sync     `CodeReplicaLive` finds each Instance's socket by its Key, the
 *             Connection id: no Connection's socket ever feeds another's records.
 *
 * A browser can set no header on a WebSocket but `Sec-WebSocket-Protocol`,
 * so the Connection Key rides there: the socket offers `ke-connect` and
 * `key.<key>`, and the server selects `ke-connect` once the key checks out.
 *
 * The socket reconnects on its own. A feed open when it dropped goes quiet,
 * so each one is opened again on every reconnect, from the newest entity it
 * has passed on: the server replays everything after it, then goes live,
 * and nothing is missed or sent twice. Commands sent while the socket is
 * down wait for it.
 */

/** The subprotocols that prove a Connection Key: none without one. */
const protocolsOf = (key: string | undefined): ReadonlyArray<string> =>
  key === undefined ? [] : ['ke-connect', `key.${key}`];

export class CodeClient extends Context.Service<
  CodeClient,
  RpcClient.FromGroup<
    typeof CodeApi,
    RpcClientError.RpcClientError | VersionGap
  >
>()('@kestack/connect/CodeClient') {
  /**
   * The API at `url`, an absolute `ws(s)://…/code/rpc` or a path in a browser,
   * proving itself with the Connection's `key` when given one.
   */
  static readonly layer = (
    url: string,
    options?: { readonly key?: string | undefined },
  ) =>
    Layer.effect(CodeClient, versionedClient(CodeApi)).pipe(
      Layer.provideMerge(
        client(CodeApi, {
          url,
          protocols:
            options?.key === undefined ? undefined : protocolsOf(options.key),
        }),
      ),
    );
}

/** Where one Connection's socket is, and the Connection Key it asks for. */
export interface Address {
  /** An absolute `ws(s)://…/code/rpc`, or a path in a browser. */
  readonly url: string;
  readonly key?: string | undefined;
}

// 1. Find
/**
 * Where each Connection is, by its id: the app gives it. `of` is run before
 * every connect, and may wait, for as long as it takes, until the Connection
 * can be reached.
 */
export class ConnectionAddress extends Context.Service<
  ConnectionAddress,
  { readonly of: (connectionId: string) => Effect.Effect<Address> }
>()('@kestack/connect/ConnectionAddress') {}

/** One Connection's API and its socket, as `CodeClients` holds them. */
export type ConnectionClient = Context.Context<CodeClient | RpcConnection>;

/** One Connection's socket, at the address `of` gives for it on each connect. */
const socketTo = (of: Effect.Effect<Address>) =>
  Layer.effect(CodeClient, versionedClient(CodeApi)).pipe(
    Layer.provideMerge(
      client(CodeApi, {
        url: Effect.map(of, ({ url }) => url),
        protocols: Effect.map(of, ({ key }) => protocolsOf(key)),
      }),
    ),
  );

/** How long a Connection's socket stays open once nothing holds it. */
const IDLE = '30 seconds';

// 2. Open
/**
 * Every Connection's client, by Connection id. `hold` gives a Connection's API and
 * its socket for as long as the Scope lasts; the first holder opens it, and
 * it closes once nothing has held it for a while.
 */
export class CodeClients extends Context.Service<
  CodeClients,
  {
    readonly hold: (
      connectionId: string,
    ) => Effect.Effect<ConnectionClient, never, Scope.Scope>;
  }
>()('@kestack/connect/CodeClients') {
  /** Each Connection's socket opened with `open`: one server, or a test. */
  static readonly make = (
    open: (connectionId: string) => Layer.Layer<CodeClient | RpcConnection>,
  ): Layer.Layer<CodeClients> =>
    Layer.effect(
      CodeClients,
      Effect.map(
        RcMap.make({
          lookup: (connectionId: string) => Layer.build(open(connectionId)),
          idleTimeToLive: IDLE,
        }),
        (sockets) =>
          CodeClients.of({
            hold: (connectionId) => RcMap.get(sockets, connectionId),
          }),
      ),
    );

  /** Each Connection's socket at the address `ConnectionAddress` gives for its id. */
  static readonly layer: Layer.Layer<CodeClients, never, ConnectionAddress> =
    Layer.unwrap(
      Effect.map(ConnectionAddress, ({ of }) =>
        CodeClients.make((connectionId) => socketTo(of(connectionId))),
      ),
    );

  /** One Connection's API and socket for everything under a Layer, held while it is built. */
  static readonly connection = (
    connectionId: string,
  ): Layer.Layer<CodeClient | RpcConnection, never, CodeClients> =>
    Layer.effectContext(
      Effect.flatMap(CodeClients, ({ hold }) => hold(connectionId)),
    );

  /** Runs `effect` against one Connection, over its own socket. */
  static readonly on = <A, E, R>(
    connectionId: string,
    effect: Effect.Effect<A, E, R>,
  ) =>
    Effect.scoped(
      Effect.flatMap(
        Effect.flatMap(CodeClients, ({ hold }) => hold(connectionId)),
        (connection) => Effect.provideContext(effect, connection),
      ),
    );

  /** Runs `stream` against one Connection, its socket held while it runs. */
  static readonly stream = <A, E, R>(
    connectionId: string,
    stream: Stream.Stream<A, E, R>,
  ) =>
    Stream.unwrap(
      Effect.map(
        Effect.flatMap(CodeClients, ({ hold }) => hold(connectionId)),
        (connection) => Stream.provideContext(stream, connection),
      ),
    );

  /** One Connection's Link now, then each change, its socket held while it is read. */
  static readonly link = (
    connectionId: string,
  ): Stream.Stream<LinkStatus, never, CodeClients> =>
    CodeClients.stream(connectionId, link);
}

/** How a Link stands: `linking`, `linked` or `relinking`. */
export type LinkStatus = 'linking' | 'linked' | 'relinking';

const linkOf: Record<ConnectionStatus, LinkStatus> = {
  connecting: 'linking',
  connected: 'linked',
  reconnecting: 'relinking',
};

/** The Link now, then each change. */
export const link = Stream.map(status, (now) => linkOf[now]);

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
 * A Replica Build, as `Replicas.child` takes it. std-toolkit does not export
 * its `Build` type, so this is as precisely as a published type can name
 * it: what it needs from the app's Layer (`CodeClients.layer`) is not checked.
 */
export type CodeReplicaBuild = Parameters<typeof Replicas.child>[0][number];

/**
 * How `CodeReplica` syncs: every project and session while the app runs, and the
 * messages of a session while a Query filters on its `sessionId`, each
 * Instance over its own Connection's socket, found by its Key. Place it with
 * `Replicas.child([CodeReplicaLive])`, and give the app `CodeClients`, which opens
 * each Connection's socket at the address `ConnectionAddress` gives.
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
