import { Context, Effect, Layer, RcMap, Stream, SubscriptionRef } from 'effect';
import type { Scope } from 'effect';
import type { Rpc, RpcClient, RpcClientError, RpcGroup } from 'effect/rpc';
import {
  client,
  connection as RpcConnection,
  status,
  type ConnectionStatus,
  type SocketWatch,
} from '@kestack/rpc-toolkit/rpc/websocket';
import {
  mismatchOf,
  type PluginMismatch,
  versionedClient,
  type VersionGap,
} from '../../cloud/contract/index.js';

/*
 * How an App reaches one Plugin on each of its Connections, whichever
 * Plugin it is: the code Plugin's client and the files Plugin's are each
 * this, over their own sockets.
 *
 * 1. Find     where a Connection's socket is, an `Address`, which the App
 *             gives again before every connect, so a Connection that comes
 *             back at a new address is reached there. The App names the
 *             Release it was built with in that address,
 *             `<tunnel>/<name>/<sha256>/rpc` (`pluginPath`): nothing here
 *             reads which.
 * 2. Open     `PluginClients` opens one socket per Connection the first
 *             time anything holds it and shares it with every other
 *             holder; it closes a while after the last lets go. A
 *             Connection running another Release closes the socket at once
 *             with `PLUGIN_MISMATCH`: until a socket to it is answered
 *             again, its Link is not linked, and `mismatch` says which
 *             Release it runs.
 * 3. Link     how each socket stands, `linking`, `linked` or `relinking`.
 *
 * A browser can set no header on a WebSocket but `Sec-WebSocket-Protocol`,
 * so the Connection Key rides there: the socket offers `ke-connect` and
 * `key.<key>`, and the server selects `ke-connect` once the key checks out.
 */

/** The subprotocols that prove a Connection Key: none without one. */
const protocolsOf = (key: string | undefined): ReadonlyArray<string> =>
  key === undefined ? [] : ['ke-connect', `key.${key}`];

/** A Plugin's API as its client calls it: each call fails with `VersionGap` where one side is older. */
export type PluginApi<Group extends RpcGroup.Any> = RpcClient.FromGroup<
  Group,
  RpcClientError.RpcClientError | VersionGap
>;

/** The Service holding one Connection's client of a Plugin's RPC group. */
type ApiKey<Self, Rpcs extends Rpc.Any> = Context.Key<
  Self,
  RpcClient.RpcClient<Rpcs, RpcClientError.RpcClientError | VersionGap>
>;

// 1. Find
/** Where one Connection's socket is, and the Connection Key it asks for. */
export interface Address {
  /** An absolute `ws(s)://…/<name>/<sha256>/rpc` or `http(s)://…`, or a path in a browser. */
  readonly url: string;
  readonly key?: string | undefined;
}

/**
 * The Plugin's API, as `Api`, over one socket at `url`, proving itself
 * with the Connection's `key` when given one. `url` and `key` are Effects
 * when they are read again before every connect.
 */
export const pluginSocket = <Self, Rpcs extends Rpc.Any>(
  Api: ApiKey<Self, Rpcs>,
  group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly url: string | Effect.Effect<string>;
    readonly key?: string | undefined | Effect.Effect<string | undefined>;
    readonly watch?: SocketWatch | undefined;
  },
) =>
  Layer.effect(Api, versionedClient(group)).pipe(
    Layer.provideMerge(
      client(group, {
        url: options.url,
        protocols: Effect.isEffect(options.key)
          ? Effect.map(options.key, protocolsOf)
          : options.key === undefined
            ? undefined
            : protocolsOf(options.key),
        watch: options.watch,
      }),
    ),
  );

/** One Connection's socket at the address `of` gives on each connect, told to `watch`. */
export const socketAt = <Self, Rpcs extends Rpc.Any>(
  Api: ApiKey<Self, Rpcs>,
  group: RpcGroup.RpcGroup<Rpcs>,
  of: Effect.Effect<Address>,
  watch: SocketWatch,
) =>
  pluginSocket(Api, group, {
    url: Effect.map(of, ({ url }) => url),
    key: Effect.map(of, ({ key }) => key),
    watch,
  });

// 2. Open
/**
 * Which Release a Connection said it runs as it closed its socket with
 * `PLUGIN_MISMATCH`, kept until a socket to it is answered, or closes
 * another way: null then.
 */
type Mismatches = SubscriptionRef.SubscriptionRef<PluginMismatch | null>;

/** What a Connection's sockets tell its `mismatches`. */
const watchOf = (mismatches: Mismatches): SocketWatch => {
  const set = (mismatch: PluginMismatch | null) =>
    Effect.runSync(SubscriptionRef.set(mismatches, mismatch));
  return {
    answered: () => set(null),
    closed: (close) => set(mismatchOf(close)),
  };
};

/** How long a Connection's socket stays open once nothing holds it. */
const IDLE = '30 seconds';

/** What a Plugin's clients do, by Connection id. */
export interface PluginClientsService<Client> {
  /** One Connection's API and socket for as long as the Scope lasts. */
  readonly hold: (
    connectionId: string,
  ) => Effect.Effect<Context.Context<Client>, never, Scope.Scope>;
  /** Which Release the Connection last closed its socket saying it runs, until a socket to it is answered; null while none did. */
  readonly mismatch: (
    connectionId: string,
  ) => Stream.Stream<PluginMismatch | null>;
}

/** Every Connection's client, opened with `open`, one socket each. */
const clientsOf = <Client>(
  open: (connectionId: string, watch: SocketWatch) => Layer.Layer<Client>,
) =>
  Effect.gen(function* () {
    const mismatches = new Map<string, Mismatches>();
    const mismatchesOf = (connectionId: string) =>
      Effect.suspend(() => {
        const kept = mismatches.get(connectionId);
        if (kept !== undefined) return Effect.succeed(kept);
        return Effect.tap(
          SubscriptionRef.make<PluginMismatch | null>(null),
          (made) => Effect.sync(() => mismatches.set(connectionId, made)),
        );
      });
    const sockets = yield* RcMap.make({
      lookup: (connectionId: string) =>
        Effect.flatMap(mismatchesOf(connectionId), (each) =>
          Layer.build(open(connectionId, watchOf(each))),
        ),
      idleTimeToLive: IDLE,
    });
    return {
      hold: (connectionId: string) => RcMap.get(sockets, connectionId),
      mismatch: (connectionId: string) =>
        Stream.unwrap(
          Effect.map(mismatchesOf(connectionId), (each) =>
            SubscriptionRef.changes(each).pipe(
              Stream.changesWith(
                (a, b) =>
                  a === b ||
                  (a !== null && b !== null && a.running === b.running),
              ),
            ),
          ),
        ),
    } satisfies PluginClientsService<Client>;
  });

/** The Service class `PluginClients` makes, and what it does for one Connection, by its id. */
export interface PluginClientsClass<
  Self,
  Id extends string,
  Client,
> extends Context.ServiceClass<Self, Id, PluginClientsService<Client>> {
  /**
   * Each Connection's socket opened with `open`: one server, or a test.
   * Each socket `open` makes tells `watch` how it answers and closes, for
   * `mismatch`; one that tells it nothing never mismatches.
   */
  readonly make: (
    open: (connectionId: string, watch: SocketWatch) => Layer.Layer<Client>,
  ) => Layer.Layer<Self>;
  /** Each Connection's socket at the address `of` gives for its id, on each connect. */
  readonly at: (
    of: (connectionId: string) => Effect.Effect<Address>,
  ) => Layer.Layer<Self>;
  /** One Connection's API and socket for everything under a Layer, held while it is built. */
  readonly connection: (
    connectionId: string,
  ) => Layer.Layer<Client, never, Self>;
  /** Runs `effect` against one Connection, over its own socket. */
  readonly on: <A, E, R>(
    connectionId: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, Exclude<R, Client> | Self>;
  /** Runs `stream` against one Connection, its socket held while it runs. */
  readonly stream: <A, E, R>(
    connectionId: string,
    stream: Stream.Stream<A, E, R>,
  ) => Stream.Stream<A, E, Exclude<R, Client> | Self>;
  /**
   * One Connection's Link now, then each change, its socket held while it
   * is read. A socket the Connection closed with `PLUGIN_MISMATCH` and
   * none answered since is not linked, though it opened: it is relinking.
   */
  readonly link: (
    connectionId: string,
  ) => Stream.Stream<LinkStatus, never, Self>;
  /** Which Release the Connection last closed its socket saying it runs, until a socket to it is answered; null while none did. */
  readonly mismatch: (
    connectionId: string,
  ) => Stream.Stream<PluginMismatch | null, never, Self>;
}

/**
 * The Service holding every Connection's client of one Plugin, by
 * Connection id, whose API is the Service `Api` over the RPC group
 * `group`. `hold` gives a Connection's API and its socket for as long as
 * the Scope lasts; the first holder opens it, and it closes once nothing
 * has held it for a while.
 *
 * ```ts
 * class FilesClients extends PluginClients<FilesClients>()(
 *   '@kestack/connect/FilesClients', FilesApi, FilesClient) {}
 * ```
 */
export const PluginClients =
  <Self>() =>
  <const Id extends string, Rpcs extends Rpc.Any, ApiSelf>(
    id: Id,
    group: RpcGroup.RpcGroup<Rpcs>,
    Api: ApiKey<ApiSelf, Rpcs>,
  ): PluginClientsClass<Self, Id, ApiSelf | RpcConnection> => {
    type Client = ApiSelf | RpcConnection;
    const Clients = Context.Service<Self, PluginClientsService<Client>>()(id);
    const hold = (connectionId: string) =>
      Effect.flatMap(Clients, ({ hold }) => hold(connectionId));

    const stream = <A, E, R>(
      connectionId: string,
      stream: Stream.Stream<A, E, R>,
    ) =>
      Stream.unwrap(
        Effect.map(hold(connectionId), (connection) =>
          Stream.provideContext(stream, connection),
        ),
      );

    const mismatch = (
      connectionId: string,
    ): Stream.Stream<PluginMismatch | null, never, Self> =>
      Stream.unwrap(
        Effect.map(Clients, ({ mismatch }) => mismatch(connectionId)),
      );

    // What each static does is said on `PluginClientsClass`.
    return class extends Clients {
      static readonly make = (
        open: (connectionId: string, watch: SocketWatch) => Layer.Layer<Client>,
      ): Layer.Layer<Self> => Layer.effect(Clients, clientsOf(open));

      static readonly at = (
        of: (connectionId: string) => Effect.Effect<Address>,
      ): Layer.Layer<Self> =>
        Layer.effect(
          Clients,
          clientsOf((connectionId, watch) =>
            socketAt(Api, group, of(connectionId), watch),
          ),
        );

      static readonly connection = (
        connectionId: string,
      ): Layer.Layer<Client, never, Self> =>
        Layer.effectContext(hold(connectionId));

      static readonly on = <A, E, R>(
        connectionId: string,
        effect: Effect.Effect<A, E, R>,
      ) =>
        Effect.scoped(
          Effect.flatMap(hold(connectionId), (connection) =>
            Effect.provideContext(effect, connection),
          ),
        );

      static readonly stream = stream;

      static readonly link = (
        connectionId: string,
      ): Stream.Stream<LinkStatus, never, Self> =>
        Stream.zipLatestWith(
          stream(connectionId, link),
          mismatch(connectionId),
          (now, mismatched): LinkStatus =>
            now === 'linked' && mismatched !== null ? 'relinking' : now,
        ).pipe(Stream.changes);

      static readonly mismatch = mismatch;
    };
  };

// 3. Link
/** How a Link stands: `linking`, `linked` or `relinking`. */
export type LinkStatus = 'linking' | 'linked' | 'relinking';

const linkOf: Record<ConnectionStatus, LinkStatus> = {
  connecting: 'linking',
  connected: 'linked',
  reconnecting: 'relinking',
};

/** The Link of the socket in context now, then each change. */
export const link = Stream.map(status, (now) => linkOf[now]);
