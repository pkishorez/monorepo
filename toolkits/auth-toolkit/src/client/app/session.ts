import { Context, Effect, Layer, ManagedRuntime, type Scope } from 'effect';
import {
  type Rpc,
  RpcClient,
  type RpcClientError,
  type RpcGroup,
} from 'effect/rpc';
import {
  createStdSync,
  type EffectRuntime,
  type SyncStore,
} from '@kstackz/std-toolkit/sync';
import { Authz } from '../../guard/index.js';
import type { Account } from '../account/index.js';
import { syncName } from './keeper.js';

/** The Api's client, signed as one Account. */
export type ApiClient<Rpcs extends Rpc.Any> = RpcClient.RpcClient<
  Rpcs,
  RpcClientError.RpcClientError
>;

const makeSync = (
  name: string,
  runtime: EffectRuntime<never>,
  store: SyncStore,
) => createStdSync<never>({ name, runtime, store });

/** One Account's Std Sync, named for its user. */
export type StdSync = ReturnType<typeof makeSync>;

/** What `createApp` hands an app's session function. */
export interface SessionContext<Rpcs extends Rpc.Any> {
  /** Whose Session it is. */
  readonly account: Account;
  /** The Api, every call signed with the Account's token. A call still on
   * its way when the Session ends never settles, so nothing of one Account
   * reaches another's screen, and nothing the Session cut off is reported
   * as an error. */
  readonly rpc: ApiClient<Rpcs>;
  /** A Std Sync named for the user, kept where the Backend keeps it: on the
   * Platform for the cloud Backend, in memory for the device Backend. Make
   * its collections; it is disposed with the Session. */
  readonly sync: StdSync;
}

interface RpcId {
  readonly '@kstackz/auth-toolkit/app/Rpc': unique symbol;
}

/**
 * Opens one Account's Session over `protocol`: a runtime holding the Api's
 * client signed with `token`, the user's Std Sync on `store`, and then the
 * app's own `session` on them. Ends, in order: the app's session, the Std
 * Sync once its writes on their way have landed, every call still in
 * flight (silently), the runtime.
 */
export const openSession = <Rpcs extends Rpc.Any, S>(options: {
  readonly api: RpcGroup.RpcGroup<Rpcs>;
  readonly protocol: Layer.Layer<RpcClient.Protocol>;
  readonly store: SyncStore;
  readonly account: Account;
  readonly token: Effect.Effect<string>;
  readonly session: (
    context: SessionContext<Rpcs>,
  ) => Effect.Effect<S, never, Scope.Scope>;
}): Effect.Effect<S, never, Scope.Scope> =>
  Effect.gen(function* () {
    const { api, account } = options;
    const Client = Context.Service<RpcId, ApiClient<Rpcs>>(
      '@kstackz/auth-toolkit/app/Rpc',
    );
    const runtime = ManagedRuntime.make(
      Layer.effect(Client, RpcClient.make(api)).pipe(
        Layer.provide([options.protocol, Authz.bearer(options.token)]),
      ) as Layer.Layer<RpcId>,
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()));
    const raw = yield* Effect.promise(() =>
      runtime.runPromise(
        Effect.gen(function* () {
          return yield* Client;
        }),
      ),
    );

    // Added before the Std Sync's, so it runs after: the Std Sync's last
    // writes still land, and only then does a cut-off call go quiet.
    let open = true;
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        open = false;
      }),
    );
    const whileOpen = <A, E, R>(call: Effect.Effect<A, E, R>) =>
      Effect.flatMap(Effect.exit(call), (exit) => (open ? exit : Effect.never));
    const rpc = Object.fromEntries(
      Object.entries(raw).map(([tag, call]) => [
        tag,
        (...args: ReadonlyArray<unknown>) => {
          const made = (call as (...args: ReadonlyArray<unknown>) => unknown)(
            ...args,
          );
          return Effect.isEffect(made) ? whileOpen(made) : made;
        },
      ]),
    ) as ApiClient<Rpcs>;

    const sync = makeSync(syncName(account.user.id), runtime, options.store);
    yield* Effect.addFinalizer(() =>
      Effect.tryPromise(() => sync.dispose()).pipe(
        Effect.catch((error) => Effect.logWarning('[sync]', error)),
      ),
    );

    return yield* options.session({ account, rpc, sync });
  });
