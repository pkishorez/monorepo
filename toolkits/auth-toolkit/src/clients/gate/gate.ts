import { Context, Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect';
import { createEffectActor, type EffectActor } from '@xstate/effect';
import type { SnapshotFrom } from 'xstate';
import { Auth, type LocalChoice, localChooser } from '../auth/index.js';
import {
  Device,
  gateMachine,
  Sessions,
  Switching,
  type Account,
  type Backend,
  backendNamed,
  type GateNotice,
  type GateUser,
  type GateView,
  type OpenAccount,
} from './domain/index.js';
import type { GatePlatform } from './platform.js';

/** What an app gives the Gate. `B` is what lives in the Backend Lifetime;
 * `S` is what its Session Lifetime opens to. */
export interface GateConfig<S, B> {
  /** The platform, made the first time the Gate is asked anything, so the
   * Gate can be made where the platform is not there yet, as on a server. */
  readonly platform: () => GatePlatform;
  /** The cloud Backend's Backend Lifetime: its Auth and whatever else the
   * app keeps for as long as it runs on it. */
  readonly cloud: () => Layer.Layer<Auth | B>;
  /** The device Backend's, loaded the first time it is chosen. `choose`
   * asks who signs in; the Local Sign-In answers it. */
  readonly device: (
    choose: Effect.Effect<LocalChoice | null>,
  ) => Promise<Layer.Layer<Auth | B>>;
  /** Opens one account's Session Lifetime, with the Backend Lifetime's
   * services; everything it acquires ends with the scope. */
  readonly session: (
    account: OpenAccount,
  ) => Effect.Effect<S, never, Scope.Scope | B>;
  /** Deletes what the device keeps for every account but these. */
  readonly keep?: (
    userIds: ReadonlyArray<string>,
  ) => Effect.Effect<void, never, B>;
}

type Snapshot = SnapshotFrom<typeof gateMachine>;
type Services = Auth | Device | Sessions | Switching;

/** One Backend at work: its Backend Lifetime, and the Gate's machine on it.
 * Closing its scope stops the machine, and with it the Session Lifetime. */
type Running = {
  readonly backend: Backend;
  readonly runtime: ManagedRuntime.ManagedRuntime<Services, never>;
  readonly scope: Scope.Closeable;
  readonly actor: EffectActor<typeof gateMachine>;
};

const CHECKING = { kind: 'checking' } as const;

const BACKEND_KEY = 'gate:backend';
const lastKey = (backend: string) => `gate:${backend}:last`;
// Where the account last open was kept before the Backends were renamed.
const FORMER_NAME: Record<Backend, string> = {
  cloud: 'remote',
  device: 'local',
};

const viewOf = <S>(snapshot: Snapshot): GateView<S> => {
  const { context } = snapshot;
  if (snapshot.matches('signingOut')) return { kind: 'signingOut' };
  if (snapshot.matches('signedOut'))
    return { kind: 'signedOut', unreachable: context.unreachable };
  if (snapshot.matches('unopenable') && context.account !== null)
    return { kind: 'unopenable', account: context.account };
  if (!snapshot.matches('open') || context.account === null) return CHECKING;
  if (context.session === null)
    return { kind: 'opening', account: context.account };
  return {
    kind: 'open',
    session: context.session as S,
    account: context.account,
    accounts: context.accounts,
  };
};

const stop = async (current: Running) => {
  await current.runtime.runPromise(Scope.close(current.scope, Exit.void));
  await current.runtime.dispose();
};

/**
 * The Gate: runs sign-in on one device for one app. It keeps the app on the
 * Backend chosen, holds the Backend Lifetime open while it stays there, and
 * the Active Account's Session Lifetime while that account stays active.
 * Nothing runs until something first asks. Make one per app.
 */
export const createGate = <S, B>(config: GateConfig<S, B>) => {
  let made: GatePlatform | undefined;
  const platform = () => (made ??= config.platform());

  // Asks who signs in on the device Backend; the Local Sign-In answers.
  const chooser = localChooser();

  // The token each account's calls carry, refreshed whenever it is checked,
  // and the calls waiting for an account's first one.
  const tokens = new Map<string, string | null>();
  const waiting = new Map<string, Set<(token: string) => void>>();
  const setToken = (id: string, token: string | null) => {
    tokens.set(id, token);
    if (token === null) return;
    const waiters = waiting.get(id);
    waiting.delete(id);
    waiters?.forEach((resume) => resume(token));
  };
  const waitForToken = (id: string): Effect.Effect<string> =>
    Effect.callback<string>((resume) => {
      const now = tokens.get(id) ?? null;
      if (now !== null) return resume(Effect.succeed(now));
      const waiter = (token: string) => resume(Effect.succeed(token));
      const waiters = waiting.get(id) ?? new Set();
      waiters.add(waiter);
      waiting.set(id, waiters);
      return Effect.sync(() => void waiting.get(id)?.delete(waiter));
    });

  const layerOf = async (backend: Backend): Promise<Layer.Layer<Services>> => {
    const lifetime =
      backend === 'device'
        ? await config.device(chooser.choose)
        : config.cloud();
    const memory = platform().memory;
    const key = lastKey(backend);

    const device = Layer.effect(
      Device,
      Effect.gen(function* () {
        const services = yield* Effect.context<B>();
        return Device.of({
          lastUser: Effect.promise(async () => {
            const stored =
              (await memory.get(key)) ??
              (await memory.get(lastKey(FORMER_NAME[backend])));
            if (stored === null) return null;
            try {
              return JSON.parse(stored) as GateUser;
            } catch {
              return null;
            }
          }),
          setLastUser: (user) =>
            Effect.promise(() =>
              memory.set(key, user === null ? null : JSON.stringify(user)),
            ),
          keep: (userIds) =>
            config.keep === undefined
              ? Effect.void
              : config.keep(userIds).pipe(Effect.provideContext(services)),
        });
      }),
    );

    const sessions = Layer.effect(
      Sessions,
      Effect.gen(function* () {
        const services = yield* Effect.context<B>();
        return Sessions.of({
          open: (account: Account) =>
            Effect.gen(function* () {
              const id = account.user.id;
              setToken(id, account.token);
              let open = true;
              // The lifetime's own scope, not the one the Backend Lifetime
              // was built in.
              const scope = yield* Effect.context<Scope.Scope>();
              const opened = yield* config
                .session({
                  user: account.user,
                  token: () => tokens.get(id) ?? null,
                  waitForToken: waitForToken(id),
                  whileOpen: (promise) =>
                    new Promise((resolve, reject) => {
                      promise.then(
                        (value) => open && resolve(value),
                        (error) => open && reject(error),
                      );
                    }),
                })
                .pipe(Effect.provideContext(Context.merge(services, scope)));
              // Added last, so it runs first: once the lifetime starts to
              // end, nothing it started reports back.
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  open = false;
                }),
              );
              return opened;
            }),
        });
      }),
    );

    const switching = Layer.effect(
      Switching,
      Effect.gen(function* () {
        const auth = yield* Auth;
        // One browser-wide Account Switch at a time; one asked for while
        // another runs waits, and only the last one waiting runs.
        let chain: Promise<void> = Promise.resolve();
        let latest: string | null = null;
        return Switching.of({
          switchTo: (token) =>
            Effect.tryPromise({
              try: () => {
                latest = token;
                const run = chain.then(() =>
                  latest === token
                    ? Effect.runPromise(auth.switchTo(token))
                    : undefined,
                );
                chain = run.catch(() => {});
                return run;
              },
              catch: (error) => error,
            }),
          announce: (quiet = []) =>
            Effect.sync(() => platform().tabs?.announce({ quiet })),
        });
      }),
    );

    return Layer.mergeAll(device, sessions, switching).pipe(
      Layer.provideMerge(lifetime),
    ) as Layer.Layer<Services>;
  };

  let running: Running | null = null;
  let view: GateView<S> = CHECKING;
  // Every change of Backend waits for the one before it.
  let queue: Promise<void> = Promise.resolve();
  let booted = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const notices: GateNotice[] = [];
  // Accounts this device signed out itself, in this tab or another: their
  // going is no Account Lost.
  const quiet = new Set<string>();
  let lastLost: unknown = null;

  const push = (notice: GateNotice) => {
    notices.push(notice);
    notify();
  };

  const observe = (snapshot: Snapshot) => {
    const { context } = snapshot;
    for (const account of context.accounts)
      if (account.token !== null) setToken(account.user.id, account.token);
    if (context.lost !== null && context.lost !== lastLost) {
      lastLost = context.lost;
      const { user } = context.lost;
      if (quiet.has(user.id)) quiet.delete(user.id);
      else push({ kind: 'accountLost', user });
    }
    view = viewOf<S>(snapshot);
  };

  const start = async (backend: Backend): Promise<Running> => {
    const runtime = ManagedRuntime.make(await layerOf(backend));
    const scope = runtime.runSync(Scope.make());
    const actor = runtime.runSync(
      createEffectActor(gateMachine).pipe(Scope.provide(scope)),
    );
    const next: Running = { backend, runtime, scope, actor };
    actor.subscribe((snapshot) => {
      if (running !== next) return;
      observe(snapshot);
      notify();
    });
    void runtime
      .runPromise(
        Effect.gen(function* () {
          return yield* (yield* Auth).takeLoginError;
        }),
      )
      .then((error) => {
        if (error !== null) push({ kind: 'loginError', error });
      }, report);
    return next;
  };

  /** Runs on `backend`, ending whatever ran before. */
  const runOn = (backend: Backend) => {
    const change = queue.then(async () => {
      if (running?.backend === backend) return;
      const previous = running;
      running = null;
      view = CHECKING;
      notify();
      if (previous !== null) await stop(previous);
      const next = await start(backend);
      running = next;
      observe(next.actor.getSnapshot());
      notify();
    });
    // A change that failed must not stop the ones after it.
    queue = change.catch(() => {});
    return change;
  };

  // Nobody awaits what the Gate does by itself, so a failure is logged
  // rather than lost.
  const report = (failed: unknown) =>
    Effect.runFork(Effect.logError('The Gate could not go on', failed));

  const chosenBackend = async (): Promise<Backend> => {
    return backendNamed(await platform().memory.get(BACKEND_KEY)) ?? 'cloud';
  };

  // A Backend the launch asked for is chosen as if by hand.
  const settledBackend = async (): Promise<Backend> => {
    const asked = platform().lifecycle.launchBackend();
    if (asked === null) return chosenBackend();
    await platform().memory.set(BACKEND_KEY, asked);
    return asked;
  };

  const send = (
    event: Parameters<EffectActor<typeof gateMachine>['send']>[0],
  ) => running?.actor.send(event);

  const checkAgain = () => send({ type: 'CHECK' });

  // Follows a Backend chosen elsewhere on this device, or else asks again.
  const follow = () =>
    chosenBackend()
      .then((backend) =>
        running === null || running.backend === backend
          ? checkAgain()
          : runOn(backend),
      )
      .catch(report);

  /** Starts on the Backend chosen, once, and looks again whenever the app
   * comes back into view, the network comes back, or another tab changes
   * something. */
  const boot = () => {
    if (booted) return;
    booted = true;
    const { lifecycle, tabs } = platform();
    settledBackend().then(runOn).catch(report);
    lifecycle.onOnlineChange(() => {
      if (lifecycle.online()) checkAgain();
    });
    lifecycle.onForeground(follow);
    tabs?.listen((message) => {
      for (const id of message.quiet) quiet.add(id);
      follow();
    });
  };

  const subscribe = (changed: () => void) => {
    boot();
    listeners.add(changed);
    return () => void listeners.delete(changed);
  };

  const online = () => platform().lifecycle.online();

  /** Whether a sign-out can happen now: only the Backend can end a sign-in,
   * so the cloud Backend has to be reachable. */
  const canSignOut = () => running?.backend === 'device' || online();

  return {
    subscribe,
    /** What every screen shows: checking until the Gate runs, and while the
     * Backend changes. */
    view: (): GateView<S> => view,
    /** The Backend running; null until it has started. */
    backend: (): Backend | null => running?.backend ?? null,
    /** Whether the device is online. */
    online,
    onOnlineChange: (changed: () => void) =>
      platform().lifecycle.onOnlineChange(changed),
    canSignOut,

    /** Chooses `backend` and runs on it at once. Each Backend keeps its own
     * Signed-in Accounts. */
    setBackend: async (backend: Backend) => {
      await platform().memory.set(BACKEND_KEY, backend);
      await runOn(backend);
      platform().tabs?.announce({ quiet: [] });
    },

    /** An Account Switch: the account opens at once from what the device
     * keeps; the Backend hears of it behind. */
    switchTo: (userId: string) => send({ type: 'SWITCH', userId }),

    /** Signs one more account in, who becomes the Active Account. On the
     * cloud Backend the page leaves for the sign-in service; on the device
     * Backend the Local Sign-In asks who. */
    addAccount: async () => {
      const current = running;
      if (current === null) return;
      const error = await current.runtime.runPromise(
        Effect.gen(function* () {
          const auth = yield* Auth;
          yield* auth.signIn();
          return yield* auth.takeLoginError;
        }),
      );
      // A sign-in that comes back to the app, as on a phone, says here why
      // it signed nobody in.
      if (error !== null) push({ kind: 'loginError', error });
      checkAgain();
    },

    /** Signs the Active Account out of this device; whoever is left opens.
     * False, and nothing happens, when the Backend can't be reached. */
    signOut: (): boolean => {
      if (!canSignOut()) return false;
      send({ type: 'SIGN_OUT' });
      return true;
    },

    /** Signs every account out of this device. False, and nothing happens,
     * when the Backend can't be reached. */
    signOutEveryone: (): boolean => {
      if (!canSignOut()) return false;
      send({ type: 'SIGN_OUT_EVERYONE' });
      return true;
    },

    /** Asks the Backend again who is signed in. */
    checkAgain,

    /** Tries again to open an account that would not open. */
    retry: () => send({ type: 'RETRY' }),

    /** The oldest Gate Notice not yet taken, once; null when none. */
    takeNotice: (): GateNotice | null => {
      const notice = notices.shift() ?? null;
      if (notice !== null) notify();
      return notice;
    },
    /** The oldest Gate Notice not yet taken, without taking it. */
    notice: (): GateNotice | null => notices[0] ?? null,

    /** Whether the device Backend is asking who signs in, and how to answer:
     * a choice, or null to sign nobody in. */
    localSignIn: {
      subscribe: chooser.subscribe,
      isAsking: chooser.isAsking,
      answer: (choice: LocalChoice | null) => chooser.answer(choice),
    },
  };
};

/** A Gate, as `createGate` makes it. */
export type Gate<S> = ReturnType<typeof createGate<S, never>>;
