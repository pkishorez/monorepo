import { Context, Effect, Layer, type Scope } from 'effect';
import { authLocal, localAccountsTable } from '../auth/index.js';
import { createGate, type OpenAccount } from '../gate/index.js';
import { gateReact } from '../gate/react/index.js';
import { AppPlatform } from './platform.js';
import { keepSyncs } from './syncs.js';

/** Deletes what the device keeps for every user but these, on the Backend
 * running. */
class Keeper extends Context.Service<
  Keeper,
  (userIds: ReadonlyArray<string>) => Effect.Effect<void>
>()('@kstackz/auth-toolkit/app/Keeper') {}

/** What an app gives `createApp`. `B` is its Backend Link, what it keeps
 * per Backend; `S` is its Session, what it keeps per signed-in user. */
export interface AppConfig<S, B> {
  /** The platform, from web-toolkit's `webPlatform` or expo-toolkit's
   * `expoPlatform`; made the first time anything asks. */
  readonly platform: () => AppPlatform['Service'];
  /** The Backend Link to the cloud Backend: what the app keeps for as long
   * as it runs there. Users sign in with the platform's cloud Auth. */
  readonly cloud: Layer.Layer<B, never, AppPlatform>;
  /** The Backend Link to the device Backend, loaded the first time it is
   * chosen, so its code is fetched only by those who choose it. Users sign in
   * by choosing any name, kept in the platform's `accounts` database. */
  readonly device: () => Promise<Layer.Layer<B, never, AppPlatform>>;
  /** The Session: what one signed-in user gets, opened when they
   * become the Active Account and closed when they stop being it. Name a Std
   * Sync with `syncName(account.user.id)` and what it keeps is deleted once they
   * sign out. */
  readonly session: (
    account: OpenAccount,
  ) => Effect.Effect<S, never, Scope.Scope | B | AppPlatform>;
  /** The database the device Backend's users are kept in. Default:
   * `device`. */
  readonly accountsDatabase?: string;
}

/**
 * An app on the kstack toolkits: sign-in on this device on the cloud or the
 * device Backend, and the app's Backend Link and Session opened and closed
 * with it. The app says what they hold; this says when. Nothing runs until a screen
 * first asks, so it can be made where the platform is not there yet, as on a
 * web server. Make one per app.
 */
export const createApp = <S, B>(config: AppConfig<S, B>) => {
  let made: AppPlatform['Service'] | undefined;
  const platform = () => (made ??= config.platform());
  const onPlatform = () => Layer.succeed(AppPlatform, platform());

  const gate = createGate<S, B | AppPlatform | Keeper>({
    platform: () => platform().gate,
    cloud: () =>
      Layer.mergeAll(
        platform().cloud.auth,
        config.cloud,
        Layer.succeed(Keeper, (userIds) =>
          Effect.tryPromise(() => keepSyncs(userIds, platform().sync)).pipe(
            Effect.catch((error) => Effect.logWarning('[syncs]', error)),
          ),
        ),
      ).pipe(Layer.provideMerge(onPlatform())),
    device: async (choose) =>
      Layer.mergeAll(
        authLocal({
          choose,
          storage: platform().table(
            localAccountsTable,
            config.accountsDatabase ?? 'device',
          ),
        }),
        await config.device(),
        // The device Backend's syncs live in memory: nothing to delete.
        Layer.succeed(Keeper, () => Effect.void),
      ).pipe(Layer.provideMerge(onPlatform())),
    session: config.session,
    keep: (userIds) =>
      Effect.gen(function* () {
        yield* (yield* Keeper)(userIds);
      }),
  });
  const react = gateReact(gate);

  return {
    /** The Gate itself, outside React: for tests and non-React code. */
    gate,
    /** The platform the app runs on. */
    platform,
    SignedIn: react.SignedIn,
    SignedOut: react.SignedOut,
    useGate: react.useGate,
    useSession: react.useSession,
    /** The Signed-in Accounts, what is done with them, and `manage`: the
     * sign-in service's page for them. Only inside `SignedIn`. */
    useAccounts: () => ({
      ...react.useAccounts(),
      manage: () => platform().cloud.manageAccounts(),
    }),
  };
};

/** An app, as `createApp` makes it. */
export type App<S> = ReturnType<typeof createApp<S, never>>;
