import { Effect, Exit, type Layer, ManagedRuntime, Scope } from 'effect';
import {
  Auth,
  type LocalChoice,
  type LoginError,
  localChooser,
} from '@kstackz/auth-toolkit/clients/auth';
import { createEffectActor, type EffectActor } from '@xstate/effect';
import { useSyncExternalStore } from 'react';
import type { SnapshotFrom } from 'xstate';
import {
  appMachine,
  type Device,
  type Sessions,
  type SignedIn,
} from '../domain/machine/index.ts';
import type { Session } from '../domain/session/index.ts';
import type { Backend } from '../domain/settings/index.ts';
import { remoteBackend } from '../backends/remote/index.ts';
import { deviceSettings } from '../state/settings/index.ts';

type AppActor = EffectActor<typeof appMachine>;
type AppSnapshot = SnapshotFrom<typeof appMachine>;
type Services = Auth | Device | Sessions;

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

/** One Backend at work: its services, and the app machine running on them.
 * Closing its scope stops the machine, and with it the Active Session. */
type Running = {
  readonly backend: Backend;
  readonly runtime: ManagedRuntime.ManagedRuntime<Services, never>;
  readonly scope: Scope.Closeable;
  readonly actor: AppActor;
};

// Asks who signs in to the Local Backend; the Local Sign-In dialog answers.
const chooser = localChooser();

// The Local Backend's code runs only for those who choose it.
const layerOf = async (backend: Backend): Promise<Layer.Layer<Services>> =>
  backend === 'local'
    ? (await import('../backends/local/index.ts')).localBackend(chooser.choose)
    : remoteBackend;

const viewOf = (snapshot: AppSnapshot): AppView => {
  if (snapshot.matches('checking')) return { kind: 'checking' };
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

let running: Running | null = null;
let view: AppView = { kind: 'checking' };
// Every change of Backend waits for the one before it.
let queue: Promise<void> = Promise.resolve();
let booted = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const stop = async (current: Running) => {
  await current.runtime.runPromise(Scope.close(current.scope, Exit.void));
  await current.runtime.dispose();
};

const start = async (backend: Backend): Promise<Running> => {
  const runtime = ManagedRuntime.make(await layerOf(backend));
  const scope = runtime.runSync(Scope.make());
  const actor = runtime.runSync(
    createEffectActor(appMachine).pipe(Scope.provide(scope)),
  );
  actor.subscribe((snapshot) => {
    if (running?.actor !== actor) return;
    view = viewOf(snapshot);
    notify();
  });
  return { backend, runtime, scope, actor };
};

/** Runs Ledger on `backend`, closing whatever ran before. */
const runOn = (backend: Backend) => {
  queue = queue.then(async () => {
    if (running?.backend === backend) return;
    const previous = running;
    running = null;
    view = { kind: 'checking' };
    notify();
    if (previous !== null) await stop(previous);
    const next = await start(backend);
    running = next;
    view = viewOf(next.actor.getSnapshot());
    notify();
  });
  return queue;
};

// `?backend=local` or `?backend=remote` chooses the Backend, as Settings
// would, and leaves the address.
const backendFromAddress = (): Backend | null => {
  const url = new URL(window.location.href);
  const asked = url.searchParams.get('backend');
  if (asked !== 'local' && asked !== 'remote') return null;
  url.searchParams.delete('backend');
  window.history.replaceState(window.history.state, '', url.href);
  return asked;
};

const settledBackend = async (): Promise<Backend> => {
  const asked = backendFromAddress();
  if (asked !== null) {
    deviceSettings().change({ backend: asked });
    return asked;
  }
  return (await deviceSettings().read()).backend;
};

/**
 * Starts Ledger on the Backend Settings chose, once per tab. It asks again
 * who is signed in whenever the tab or the network comes back, and follows
 * a Backend another tab chose.
 */
const boot = () => {
  if (booted) return;
  booted = true;
  void settledBackend().then(runOn);
  const check = () => running?.actor.send({ type: 'CHECK' });
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void deviceSettings()
      .read()
      .then(({ backend }) =>
        running === null || running.backend === backend
          ? check()
          : runOn(backend),
      );
  });
};

const subscribe = (changed: () => void) => {
  boot();
  listeners.add(changed);
  return () => void listeners.delete(changed);
};

const CHECKING: AppView = { kind: 'checking' };

/** Ledger's lifecycle as React sees it; checking until it runs in a
 * browser, and while the Backend changes. */
export const useApp = (): AppView =>
  useSyncExternalStore(
    subscribe,
    () => view,
    () => CHECKING,
  );

/** The Backend Ledger runs on; null until it has started. */
export const useBackend = (): Backend | null =>
  useSyncExternalStore(
    subscribe,
    () => running?.backend ?? null,
    () => null,
  );

/** Saves `backend` in Settings and runs Ledger on it, at once. Each
 * Backend keeps its own Users. */
export const setBackend = (backend: Backend) => {
  deviceSettings().change({ backend });
  return runOn(backend);
};

/** Opens another signed-in User's Session. */
export const switchUser = (userId: string) =>
  running?.actor.send({ type: 'SWITCH', userId });

/** Asks again who is signed in. */
export const checkAgain = () => running?.actor.send({ type: 'CHECK' });

/**
 * Signs one more User in, the first or an Add User, who becomes the Active
 * Session. On the Remote Backend the page leaves for Google and comes back
 * to this Place; on the Local Backend the Local Sign-In dialog asks who.
 * Fails when the Backend can't be reached.
 */
export const addUser = async () => {
  const current = running;
  if (current === null) return;
  await current.runtime.runPromise(
    Effect.flatMap(Auth, (auth) => auth.signIn()),
  );
  checkAgain();
};

/** Why the last sign-in came back without signing anyone in, once. */
export const takeLoginError = async (): Promise<LoginError | null> => {
  await queue;
  const current = running;
  if (current === null) return null;
  return current.runtime.runPromise(
    Effect.flatMap(Auth, (auth) => auth.takeLoginError),
  );
};

/** Signs the open User out of this device; whoever is left opens. */
export const signOut = () => running?.actor.send({ type: 'SIGN_OUT' });

/** Signs every User out of this Backend and deletes every copy. */
export const signOutEveryone = () =>
  running?.actor.send({ type: 'SIGN_OUT_EVERYONE' });

/** Whether the Local Backend is asking who signs in, and how to answer:
 * a choice, or null to sign nobody in. */
export const useLocalSignIn = () => ({
  asking: useSyncExternalStore(
    chooser.subscribe,
    chooser.isAsking,
    () => false,
  ),
  answer: (choice: LocalChoice | null) => chooser.answer(choice),
});
