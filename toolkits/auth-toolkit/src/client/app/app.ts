import { Context, Effect, Layer, type Scope } from 'effect';
import type { Rpc as EffectRpc, RpcClient, RpcGroup } from 'effect/rpc';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { Sync, type SyncStore } from '@kstackz/std-toolkit/sync';
import { createGate } from '../gate/index.js';
import { gateReact } from '../gate/index.js';
import type { Platform } from '../platform/index.js';
import { named, namedAccountsTable } from '../sign-in/named/index.js';
import { keepSyncs } from './keeper.js';
import { openSession, type SessionContext } from './session.js';

/** The device Backend: the Api's handlers with everything they stand on,
 * `authz.layer` and `authz.device` among them. */
export type DeviceBackend<Rpcs extends EffectRpc.Any> = Layer.Layer<
  EffectRpc.ToHandler<Rpcs> | EffectRpc.Middleware<Rpcs>,
  unknown
>;

/** What an app gives `createApp`. `S` is its Session: what one Account
 * holds while it is active. */
export interface AppConfig<Rpcs extends EffectRpc.Any, S> {
  /** The Platform, made the first time anything asks. */
  readonly platform: () => Platform;
  /** The app's Api: called over HTTP at the Platform's cloud address on
   * the cloud Backend, in this process on the device Backend. */
  readonly api: RpcGroup.RpcGroup<Rpcs>;
  /** The device Backend, or what loads it the first time it is chosen, so
   * only those who choose it fetch its code. Users sign in to it by name,
   * kept in the Platform's `device` database. Without it, the app has only
   * the cloud Backend. */
  readonly device?:
    | DeviceBackend<Rpcs>
    | ((
        platform: Platform,
      ) => DeviceBackend<Rpcs> | Promise<DeviceBackend<Rpcs>>);
  /** What one Account's Session holds, opened when it becomes active and
   * closed when it stops being active. */
  readonly session: (
    context: SessionContext<Rpcs>,
  ) => Effect.Effect<S, never, Scope.Scope>;
}

/** What runs while the app is on one Backend: how a Session reaches the
 * Api, where its Std Sync is kept, and what deletes signed-out users'. */
class Link extends Context.Service<
  Link,
  {
    readonly protocol: Layer.Layer<RpcClient.Protocol>;
    readonly store: SyncStore;
    readonly keep: (userIds: ReadonlyArray<string>) => Effect.Effect<void>;
  }
>()('@kstackz/auth-toolkit/app/Link') {}

const rpcUrl = (url: string) => `${url.replace(/\/$/, '')}/rpc`;

/**
 * An app on the kstack toolkits: sign-in on this device on the cloud or the
 * device Backend, and one Session per active Account, with the Api signed
 * as them and a Std Sync named for them. The app says what a Session holds;
 * this says when. Nothing runs until a screen first asks, so it can be made
 * where the Platform is not there yet, as on a web server. Make one per app.
 */
export const createApp = <Rpcs extends EffectRpc.Any, S>(
  config: AppConfig<Rpcs, S>,
) => {
  let made: Platform | undefined;
  const platform = () => (made ??= config.platform());
  const { api, device } = config;

  const cloud = () => {
    const { cloud, storage } = platform();
    return Layer.mergeAll(
      cloud.signIn,
      Layer.succeed(Link, {
        // A call carries its Account's token and never a cookie, which
        // names whoever is active in the browser.
        protocol: Rpc.http.client(api, {
          url: rpcUrl(cloud.url),
          credentials: 'omit',
        }),
        store: storage.sync,
        keep: (userIds) =>
          Effect.tryPromise(() => keepSyncs(userIds, storage.sync)).pipe(
            Effect.catch((error) => Effect.logWarning('[syncs]', error)),
            Effect.asVoid,
          ),
      }),
    );
  };

  const loadDevice = async (): Promise<DeviceBackend<Rpcs>> =>
    typeof device === 'function'
      ? device(platform())
      : (device as DeviceBackend<Rpcs>);

  const gate = createGate<S, Link>({
    platform,
    cloud,
    ...(device !== undefined && {
      device: async (choose) =>
        Layer.mergeAll(
          named({
            choose,
            storage: platform().storage.table(namedAccountsTable, 'device'),
          }),
          Layer.succeed(Link, {
            protocol: Rpc.inProcess
              .client(api, await loadDevice())
              .pipe(Layer.orDie),
            // The device Backend keeps everything already: a Session's
            // Std Sync lives in memory, and there is nothing to delete.
            store: Sync.memory(),
            keep: () => Effect.void,
          }),
        ),
    }),
    session: (account, token) =>
      Effect.gen(function* () {
        const { protocol, store } = yield* Link;
        return yield* openSession({
          api,
          protocol,
          store,
          account,
          token,
          session: config.session,
        });
      }),
    keep: (userIds) =>
      Effect.gen(function* () {
        yield* (yield* Link).keep(userIds);
      }),
  });
  const react = gateReact(gate);

  return {
    /** The Gate itself, outside React: for tests and non-React code. */
    gate,
    /** The Platform the app runs on. */
    platform,
    SignedIn: react.SignedIn,
    SignedOut: react.SignedOut,
    useGate: react.useGate,
    useSession: react.useSession,
    /** The Accounts signed in, what is done with them, and `manage`: the
     * sign-in service's page for them. Only inside `SignedIn`. */
    useAccounts: () => ({
      ...react.useAccounts(),
      manage: () => platform().cloud.manageAccounts(),
    }),
  };
};

/** An app, as `createApp` makes it. */
export type App<S> = ReturnType<typeof createApp<never, S>>;
