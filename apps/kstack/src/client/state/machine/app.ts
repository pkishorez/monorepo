import { Effect, ManagedRuntime, Scope } from 'effect';
import { Accounts } from '@kstackz/auth-toolkit/clients/accounts';
import { createEffectActor, type EffectActor } from '@xstate/effect';
import { useMemo, useSyncExternalStore } from 'react';
import type { SnapshotFrom } from 'xstate';
import type { Session } from '../session/index.ts';
import { appLive, forgetTabUser } from './live.ts';
import { appMachine } from './machine.ts';
import type { SignedIn } from './services.ts';

type AppActor = EffectActor<typeof appMachine>;
type AppSnapshot = SnapshotFrom<typeof appMachine>;

// One set of services for the machine and for signing in, so both see the
// same Signed-in Accounts.
const runtime = ManagedRuntime.make(appLive);

let app: AppActor | undefined;

/**
 * The tab's one app machine, started on first use and never stopped. It asks
 * again who is signed in whenever the tab or the network comes back.
 */
const getApp = (): AppActor => {
  if (app !== undefined) return app;
  const started = runtime.runSync(
    createEffectActor(appMachine).pipe(Scope.provide(Scope.makeUnsafe())),
  );
  const check = () => started.send({ type: 'CHECK' });
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  app = started;
  return started;
};

const subscribe = (changed: () => void) => {
  const subscription = getApp().subscribe(changed);
  return () => subscription.unsubscribe();
};

/** What Ledger shows, from the app machine's state. */
export type AppView =
  | { readonly kind: 'checking' }
  | { readonly kind: 'signedOut'; readonly unreachable: boolean }
  | { readonly kind: 'opening'; readonly user: SignedIn }
  | { readonly kind: 'signingOut' }
  | {
      readonly kind: 'open';
      readonly session: Session;
      readonly user: SignedIn;
      readonly signedIn: ReadonlyArray<SignedIn>;
    };

const viewOf = (snapshot: AppSnapshot | null): AppView => {
  if (snapshot === null || snapshot.matches('checking')) {
    return { kind: 'checking' };
  }
  if (snapshot.matches('signingOut')) return { kind: 'signingOut' };
  const { context } = snapshot;
  if (snapshot.matches('signedOut')) {
    return { kind: 'signedOut', unreachable: context.unreachable };
  }
  if (context.user === null) return { kind: 'checking' };
  if (context.session === null) return { kind: 'opening', user: context.user };
  return {
    kind: 'open',
    session: context.session,
    user: context.user,
    signedIn: context.signedIn,
  };
};

/** Ledger's lifecycle as React sees it; checking until it runs in a browser. */
export const useApp = (): AppView => {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getApp().getSnapshot(),
    () => null,
  );
  return useMemo(() => viewOf(snapshot), [snapshot]);
};

/** Opens another signed-in User's Session. */
export const switchUser = (userId: string) =>
  getApp().send({ type: 'SWITCH', userId });

/** Asks again who is signed in. */
export const checkAgain = () => getApp().send({ type: 'CHECK' });

/**
 * Signs one more User in, the first or an Add User: by way of Google, coming
 * back to this Place. The new User becomes the browser's active one, so this
 * tab first forgets its own, to open them at the next check. Fails when the
 * sign-in service can't be reached.
 */
export const addUser = () =>
  runtime
    .runPromise(
      Effect.gen(function* () {
        yield* Effect.sync(forgetTabUser);
        yield* (yield* Accounts).signIn();
      }),
    )
    .then(checkAgain);

/** Why the last sign-in came back without signing anyone in, once. */
export const takeLoginError = () =>
  runtime.runPromise(
    Effect.flatMap(Accounts, (accounts) => accounts.takeLoginError),
  );

/** Signs the open User out of this device; whoever is left opens. */
export const signOut = () => getApp().send({ type: 'SIGN_OUT' });

/** Signs every User out of this browser and deletes every copy. */
export const signOutEveryone = () =>
  getApp().send({ type: 'SIGN_OUT_EVERYONE' });
