import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  type Scope,
  Stream,
} from 'effect';
import { type RpcClient, RpcClient as Client } from 'effect/rpc';
import type { Account } from '@kstackz/auth-toolkit/client';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import {
  createStdSync,
  type EffectRuntime,
  type SyncStore,
} from '@kstackz/std-toolkit/sync';
import type { ApiClients, Apis } from '../apis/index.ts';
import type { SessionContext } from './define.ts';
import { SessionClosed } from './define.ts';
import { syncName } from './keeper.ts';
import type { StatusCell } from './status.ts';

const makeSync = (
  name: string,
  runtime: EffectRuntime<never>,
  store: SyncStore,
) => createStdSync<never>({ name, runtime, store });

/** One Account's Std Sync, named for its user. */
export type StdSync = ReturnType<typeof makeSync>;

/** An open Session as the Web Platform holds it: the app's value, the APIs
 * signed as the Account, how to run an Effect in it, and its status. */
export interface Opened<S> {
  readonly value: S;
  readonly apis: Readonly<Record<string, unknown>>;
  readonly run: (
    effect: Effect.Effect<unknown, unknown, never>,
  ) => Promise<unknown>;
  readonly status: StatusCell;
}

interface ClientOf {
  readonly '@kstackz/web-platform/ApiClient': unique symbol;
}

type AnyCall = (...args: ReadonlyArray<unknown>) => unknown;

// One API's client, and its WebSocket connection if it has one.
interface Made {
  readonly client: object;
  readonly connection: Option.Option<Rpc.websocket.connection['Service']>;
}

// Done once a connection that was up goes down: a stream on it is stranded
// then, as nothing it was sent survives the server's side of the socket.
const droppedOn = (connection: Made['connection']) =>
  Option.match(connection, {
    onNone: () => Effect.never,
    onSome: ({ connectionStatus }) =>
      connectionStatus.pipe(
        Stream.dropWhile((status) => status !== 'connected'),
        Stream.filter((status) => status !== 'connected'),
        Stream.runHead,
        Effect.asVoid,
      ),
  });

/**
 * Opens one Account's Session: a runtime holding every API's client, each
 * over its own protocol and signed with `token`, the user's Std Sync on
 * `store`, and then the app's own Session on them. Ends, in order: the
 * app's Session, the Std Sync once its writes on their way have landed,
 * every call still in flight (interrupted), the runtime.
 */
export const openSession = <A extends Apis, S>(options: {
  readonly apis: A;
  readonly protocols: {
    readonly [K in keyof A]: Layer.Layer<RpcClient.Protocol>;
  };
  readonly store: SyncStore;
  readonly account: Account;
  readonly token: Effect.Effect<string>;
  readonly status: StatusCell;
  readonly open: (
    context: SessionContext<A>,
  ) => Effect.Effect<S, never, Scope.Scope>;
  /** The Session's Service, provided to everything `run` runs. */
  readonly service: Context.Key<unknown, S>;
}): Effect.Effect<Opened<S>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const { apis, account } = options;
    const names = Object.keys(apis);
    const keys = new Map(
      names.map((name) => [
        name,
        Context.Service<ClientOf, Made>(
          `@kstackz/web-platform/ApiClient/${name}`,
        ),
      ]),
    );
    const bearer = Authz.bearer(options.token);
    const layers = names.map((name) =>
      Layer.effect(
        keys.get(name)!,
        Effect.all({
          client: Client.make(apis[name]!.group),
          connection: Effect.serviceOption(Rpc.websocket.connection),
        }),
      ).pipe(Layer.provide([options.protocols[name]!, bearer])),
    );
    const runtime = ManagedRuntime.make(
      (layers.length === 0
        ? Layer.empty
        : Layer.mergeAll(
            ...(layers as [Layer.Layer<ClientOf>]),
          )) as Layer.Layer<ClientOf>,
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()));
    const raw = yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.forEach(names, (name) =>
          Effect.gen(function* () {
            return yield* keys.get(name)!;
          }),
        ),
      ),
    );

    // Added before the Std Sync's, so it runs after: the Std Sync's last
    // writes still land, and only then is a call still in flight cut off.
    const closed = yield* Deferred.make<void>();
    yield* Effect.addFinalizer(() => Deferred.succeed(closed, undefined));
    const cut = <X, E, R>(call: Effect.Effect<X, E, R>) =>
      Effect.raceFirst(
        call,
        Effect.andThen(Deferred.await(closed), Effect.interrupt),
      );
    // A stream ends when the Session closes, and when its socket drops, so
    // whoever reads it opens it again from where they have got to.
    const signed = ({ client, connection }: Made) =>
      Object.fromEntries(
        Object.entries(client).map(([tag, call]) => [
          tag,
          typeof call !== 'function'
            ? call
            : (...args: ReadonlyArray<unknown>) => {
                const made = (call as AnyCall)(...args);
                return Effect.isEffect(made)
                  ? cut(made)
                  : Stream.isStream(made)
                    ? Stream.interruptWhen(
                        made,
                        Effect.raceFirst(
                          Deferred.await(closed),
                          droppedOn(connection),
                        ),
                      )
                    : made;
              },
        ]),
      );
    const clients = Object.fromEntries(
      names.map((name, index) => [name, signed(raw[index] as Made)]),
    ) as ApiClients<A>;

    const sync = makeSync(syncName(account.user.id), runtime, options.store);
    yield* Effect.addFinalizer(() =>
      Effect.tryPromise(() => sync.dispose()).pipe(
        Effect.catch((error) => Effect.logWarning('[sync]', error)),
      ),
    );

    const value = yield* options.open({
      account,
      apis: clients,
      sync,
      status: options.status.ref,
    });

    const run = (effect: Effect.Effect<unknown, unknown, never>) =>
      Deferred.isDoneUnsafe(closed)
        ? Promise.reject(new SessionClosed())
        : runtime
            .runPromiseExit(
              cut(
                Effect.provideService(
                  effect as Effect.Effect<unknown, unknown, unknown>,
                  options.service,
                  value,
                ) as Effect.Effect<unknown, unknown, never>,
              ),
            )
            .then((exit) => {
              if (Exit.isSuccess(exit)) return exit.value;
              if (Cause.hasInterruptsOnly(exit.cause))
                throw new SessionClosed();
              throw Cause.squash(exit.cause);
            });

    return { value, apis: clients, run, status: options.status };
  });
