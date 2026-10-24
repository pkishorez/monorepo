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
import { AiApi, type WireEntity } from '../contract/index.js';
import {
  MessageSchema,
  PROJECTION_VERSION,
} from '../../services/records/projection/index.js';
import {
  ProjectSchema,
  SessionSchema,
} from '../../services/records/entities/index.js';

/*
 * What an app needs to talk to ai-toolkit servers, its Machines: each
 * Machine's API over that Machine's own WebSocket, and a Replica that keeps
 * every Machine's projects, sessions and the messages of each open session
 * in step with it, one Instance per Machine, each syncing through its own
 * Machine's socket.
 *
 * 1. Find     a Machine by its id: `MachineAddress`, which the app gives,
 *             says where its socket is and which Machine Key it asks for,
 *             again before every connect, so a Machine that comes back at
 *             a new address is reached there.
 * 2. Open     `AiClients` opens one socket per Machine the first time
 *             anything holds it, an Instance's Strategies or a call, and
 *             shares it with every other holder; it closes a while after
 *             the last lets go.
 * 3. Sync     `AiLive` finds each Instance's socket by its Key, the
 *             Machine id: no Machine's socket ever feeds another's records.
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

/** The subprotocols that prove a Machine Key: none without one. */
const protocolsOf = (key: string | undefined): ReadonlyArray<string> =>
  key === undefined ? [] : ['ai-toolkit', `key.${key}`];

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
            options?.key === undefined ? undefined : protocolsOf(options.key),
        }),
      ),
    );
}

/** Where one Machine's socket is, and the Machine Key it asks for. */
export interface Address {
  /** An absolute `ws(s)://…/rpc`, or a path in a browser. */
  readonly url: string;
  readonly key?: string | undefined;
}

// 1. Find
/**
 * Where each Machine is, by its id: the app gives it. `of` is run before
 * every connect, and may wait, for as long as it takes, until the Machine
 * can be reached.
 */
export class MachineAddress extends Context.Service<
  MachineAddress,
  { readonly of: (machineId: string) => Effect.Effect<Address> }
>()('@kestack/ai-toolkit/MachineAddress') {}

/** One Machine's API and its socket's connection, as `AiClients` holds them. */
export type MachineClient = Context.Context<AiClient | RpcConnection>;

/** One Machine's socket, at the address `of` gives for it on each connect. */
const socketTo = (of: Effect.Effect<Address>) =>
  Layer.effect(AiClient, RpcClient.make(AiApi)).pipe(
    Layer.provideMerge(
      client(AiApi, {
        url: Effect.map(of, ({ url }) => url),
        protocols: Effect.map(of, ({ key }) => protocolsOf(key)),
      }),
    ),
  );

/** How long a Machine's socket stays open once nothing holds it. */
const IDLE = '30 seconds';

// 2. Open
/**
 * Every Machine's client, by Machine id. `hold` gives a Machine's API and
 * its socket for as long as the Scope lasts; the first holder opens it, and
 * it closes once nothing has held it for a while.
 */
export class AiClients extends Context.Service<
  AiClients,
  {
    readonly hold: (
      machineId: string,
    ) => Effect.Effect<MachineClient, never, Scope.Scope>;
  }
>()('@kestack/ai-toolkit/AiClients') {
  /** Each Machine's socket opened with `open`: one server, or a test. */
  static readonly make = (
    open: (machineId: string) => Layer.Layer<AiClient | RpcConnection>,
  ): Layer.Layer<AiClients> =>
    Layer.effect(
      AiClients,
      Effect.map(
        RcMap.make({
          lookup: (machineId: string) => Layer.build(open(machineId)),
          idleTimeToLive: IDLE,
        }),
        (sockets) =>
          AiClients.of({ hold: (machineId) => RcMap.get(sockets, machineId) }),
      ),
    );

  /** Each Machine's socket at the address `MachineAddress` gives for its id. */
  static readonly layer: Layer.Layer<AiClients, never, MachineAddress> =
    Layer.unwrap(
      Effect.map(MachineAddress, ({ of }) =>
        AiClients.make((machineId) => socketTo(of(machineId))),
      ),
    );

  /** One Machine's API and socket for everything under a Layer, held while it is built. */
  static readonly machine = (
    machineId: string,
  ): Layer.Layer<AiClient | RpcConnection, never, AiClients> =>
    Layer.effectContext(
      Effect.flatMap(AiClients, ({ hold }) => hold(machineId)),
    );

  /** Runs `effect` against one Machine, over its own socket. */
  static readonly on = <A, E, R>(
    machineId: string,
    effect: Effect.Effect<A, E, R>,
  ) =>
    Effect.scoped(
      Effect.flatMap(
        Effect.flatMap(AiClients, ({ hold }) => hold(machineId)),
        (machine) => Effect.provideContext(effect, machine),
      ),
    );

  /** Runs `stream` against one Machine, its socket held while it runs. */
  static readonly stream = <A, E, R>(
    machineId: string,
    stream: Stream.Stream<A, E, R>,
  ) =>
    Stream.unwrap(
      Effect.map(
        Effect.flatMap(AiClients, ({ hold }) => hold(machineId)),
        (machine) => Stream.provideContext(stream, machine),
      ),
    );

  /** One Machine's connection now, then each change, its socket held while it is read. */
  static readonly connection = (
    machineId: string,
  ): Stream.Stream<ConnectionStatus, never, AiClients> =>
    AiClients.stream(machineId, status);
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
 * A feed that survives reconnects, over the socket of the Instance's own
 * Machine, its Key. The Replica hands over its cursor once, as the feed
 * opens; each reopen after a reconnect starts from the newest entity this
 * feed has passed on since, not from that first cursor.
 */
const resumable =
  (
    open: (
      api: AiClient['Service'],
      after: WireEntity | null,
    ) => Stream.Stream<ReadonlyArray<WireEntity>, unknown>,
  ) =>
  ({ key, after }: { readonly key: string; readonly after: Wire | null }) =>
    AiClients.stream(
      key,
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
      ),
    );

/*
 * A device keeps Messages as the projection made them, so the Replica's
 * name carries the projection's version: a new projection is a new Replica,
 * synced afresh. An app prunes its Store to `Ai` alone, so the older ones
 * go without being named.
 */
const replicaName = (version: number) => `ai-m${version}`;

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
 * it: what it needs from the app's Layer (`AiClients.layer`) is not checked.
 */
export type AiBuild = Parameters<typeof Replicas.child>[0][number];

/**
 * How `Ai` syncs: every project and session while the app runs, and the
 * messages of a session while a Query filters on its `sessionId`, each
 * Instance over its own Machine's socket, found by its Key. Place it with
 * `Replicas.child([AiLive])`, and give the app `AiClients`, which opens
 * each Machine's socket at the address `MachineAddress` gives.
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
