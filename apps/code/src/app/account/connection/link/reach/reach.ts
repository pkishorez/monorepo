import { Context, Effect, Layer, Option, type Scope, Stream } from 'effect';
import { pluginPath } from '@kestack/connect/cloud';
import { CodeClients, ConnectionAddress } from '@kestack/connect/code';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Connections } from '../../../account.ts';
import { PLUGIN_CODE } from './release.ts';

/*
 * How the app reaches every Connection of the signed-in Account's list.
 * Each Connection Actor owns the one socket to its Connection, in its own
 * scope: it opens as the Actor starts, and closes as it stops, as the
 * Account leaves `Active` or the Connection leaves the list. Everything
 * else only borrows it, through `Connections`, while it runs.
 *
 * 1. Records  a Connection's `CodeReplica` Instance, keyed by its id, is held
 *             by that Connection's own Replicas, over its own sync Store, found
 *             through `Connections`: one runs only while the Connection is
 *             listed and runs here, so an address naming another Account's
 *             Connection never reads what this device keeps of it, and a page
 *             reads its Connection's Store and no other's.
 * 2. Socket   each Connection's socket dials its `https://` address, over
 *             `wss`, at the code Plugin's Release this Code was built with,
 *             `/code/<sha256>/rpc` (`release.ts`), offering its Connection
 *             Key as listed on each connect, so a Connection that comes
 *             back at a new address, as a quick tunnel does, is reached
 *             there, and with a Connection Key that rotated, which the
 *             Account's page asks for once a socket is closed for an expired
 *             key. Until it is listed with one, its socket waits. A Connection
 *             running another Release closes it at once; who is behind is
 *             `release.ts`'s to say. `Sockets` opens it, and only a Connection
 *             Actor asks it to.
 * 3. Borrow   what the Account's page gives everything under it,
 *             `CodeClients`, holds no socket of its own: each call or
 *             stream on a Connection waits until that Connection runs,
 *             then goes over its socket.
 */

/** 1. Records: each Connection's Instance, held by that Connection's Replicas once it runs, waiting until it does. */
export const byConnection = Layer.effect(
  Replicas,
  Effect.map(Connections, ({ replicas }) =>
    Replicas.of({
      hold: (replica, key) =>
        Effect.flatMap(replicas(key), (each) => each.hold(replica, key)),
    }),
  ),
);

/** 2. Socket: where each Connection's code Plugin is, at `release`, as listed, once it is. */
export const addressAt = (release: string) =>
  Layer.effect(
    ConnectionAddress,
    Effect.map(Connections, ({ reachable }) =>
      ConnectionAddress.of({
        of: (connectionId) =>
          Effect.map(reachable(connectionId), ({ tunnel, key }) => ({
            url: `${tunnel}${pluginPath('code', release)}`,
            key,
          })),
      }),
    ),
  );

/**
 * 2. Socket: what opens a Connection's sockets, in the Scope that asks:
 * they close as it closes. Only a Connection Actor asks, in its own.
 */
export class Sockets extends Context.Service<
  Sockets,
  {
    readonly open: Effect.Effect<CodeClients['Service'], never, Scope.Scope>;
  }
>()('code/Sockets') {
  /** Sockets as `pool` opens them: each Connection's own, or a test's. */
  static readonly from = <R>(pool: Layer.Layer<CodeClients, never, R>) =>
    Layer.effect(
      Sockets,
      Effect.map(Effect.context<R>(), (context) =>
        Sockets.of({
          open: Effect.map(
            Layer.build(Layer.provide(pool, Layer.succeedContext(context))),
            (built) => Context.get(built, CodeClients),
          ),
        }),
      ),
    );
}

/** 2. Socket: each Connection's own, at the address it is listed at. */
export const sockets = Sockets.from(
  CodeClients.layer.pipe(Layer.provide(addressAt(PLUGIN_CODE))),
);

/** The first of `stream` that is not null; waits for one, for ever if need be. */
const firstOf = <A>(stream: Stream.Stream<A | null>): Effect.Effect<A> =>
  stream.pipe(
    Stream.filter((each): each is A => each !== null),
    Stream.runHead,
    Effect.flatMap(
      Option.match({ onNone: () => Effect.never, onSome: Effect.succeed }),
    ),
  );

/** What `read` says of a Connection's clients while it runs, and `none` while it does not. */
const whileRunning = <A>(
  clients: Stream.Stream<CodeClients['Service'] | null>,
  none: A,
  read: (running: CodeClients['Service']) => Stream.Stream<A>,
) =>
  clients.pipe(
    Stream.switchMap((running) =>
      running === null ? Stream.make(none) : read(running),
    ),
    Stream.changes,
  );

/**
 * 3. Borrow: every Connection's socket, borrowed from its Connection while
 * it runs. A hold waits until it runs; it is neither mismatched nor expired
 * while it does not.
 */
export const borrowing = Layer.effect(
  CodeClients,
  Effect.map(Connections, ({ clients }) =>
    CodeClients.of({
      hold: (connectionId) =>
        Effect.flatMap(firstOf(clients(connectionId)), (running) =>
          running.hold(connectionId),
        ),
      mismatch: (connectionId) =>
        whileRunning(clients(connectionId), null, (running) =>
          running.mismatch(connectionId),
        ),
      expired: (connectionId) =>
        whileRunning(clients(connectionId), false, (running) =>
          running.expired(connectionId),
        ),
    }),
  ),
);

/** What the Account's page gives everything under it: every listed Connection's records and socket, borrowed, and what opens them. */
export const reach = Layer.mergeAll(byConnection, borrowing, sockets);
