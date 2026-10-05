import { Effect, Scope } from 'effect';
import { createEffectActor, type EffectActor } from '@xstate/effect';
import { useMemo, useSyncExternalStore } from 'react';
import type { SnapshotFrom } from 'xstate';
import type { Session } from '../session/index.ts';
import { authClient } from './auth.ts';
import { appLive, forgetTabUser } from './live.ts';
import { appMachine } from './machine.ts';
import type { SignedIn } from './services.ts';

type AppActor = EffectActor<typeof appMachine>;
type AppSnapshot = SnapshotFrom<typeof appMachine>;

let app: AppActor | undefined;

/**
 * The tab's one app machine, started on first use and never stopped. It asks
 * again who is signed in whenever the tab or the network comes back.
 */
const getApp = (): AppActor => {
  if (app !== undefined) return app;
  const started = Effect.runSync(
    createEffectActor(appMachine).pipe(
      Scope.provide(Scope.makeUnsafe()),
      Effect.provide(appLive),
    ),
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
 * Add User: goes to Google and comes back to this Place. Signing in makes the
 * new User the browser's active one, so this tab forgets its own to open them.
 */
export const addUser = async () => {
  const { error } = await authClient.signIn.google();
  if (error) throw error;
  forgetTabUser();
};

/** Signs the open User out of this device; whoever is left opens. */
export const signOut = () => getApp().send({ type: 'SIGN_OUT' });

/** Signs every User out of this browser and deletes every copy. */
export const signOutEveryone = () =>
  getApp().send({ type: 'SIGN_OUT_EVERYONE' });
