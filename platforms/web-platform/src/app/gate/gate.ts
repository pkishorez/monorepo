import {
  Cause,
  Effect,
  Exit,
  Fiber,
  type Layer,
  ManagedRuntime,
  Scope,
  Stream,
} from 'effect';
import {
  type Account,
  Accounts,
  type AccountsState,
} from '@kestack/auth-toolkit/client';
import { localChooser } from '@kestack/auth-toolkit/client/browser';
import { type Backend, backendNamed, type Host } from '../host/index.ts';
import { makeStatus, type StatusCell } from '../session/index.ts';
import { gateMemory, gateTable, type LostAccount } from './memory.ts';
import type { GateNotice, GateView } from './types.ts';

/** Who signs in on the Local Backend: an email, and optionally a name. */
export interface LocalChoice {
  readonly email: string;
  readonly name?: string;
}

/** What an app gives the Gate. `B` is what the app keeps for as long as it
 * runs on one Backend; `S` is what one Account's Session opens to. */
export interface GateConfig<S, B> {
  /** The Host, made the first time the Gate is asked anything, so the Gate
   * can be made where the Host is not there yet, as on a server. The Gate
   * keeps what it remembers in its own `gate` database there. */
  readonly host: () => Host;
  /** What runs while the app is on the cloud Backend: its Accounts and
   * whatever else the app keeps there. */
  readonly cloud: () => Layer.Layer<Accounts | B>;
  /** The same for the Local Backend, loaded the first time it is chosen.
   * `choose` asks who signs in; the Local Sign-In answers it. Without it,
   * the app has only the cloud Backend. */
  readonly local?: (
    choose: Effect.Effect<LocalChoice | null>,
  ) => Promise<Layer.Layer<Accounts | B>>;
  /** Opens one Account's Session, with what runs on the Backend; everything
   * it acquires ends with the scope. `status` says whether the Account has
   * been confirmed since it opened; the Gate keeps it. */
  readonly session: (
    account: Account,
    status: StatusCell,
  ) => Effect.Effect<S, never, Scope.Scope | B>;
  /** Deletes what the device keeps for every account but these. */
  readonly keep?: (
    userIds: ReadonlyArray<string>,
  ) => Effect.Effect<void, never, B>;
}

/** One Account's Session, from when it starts opening until it closes. */
interface OpenSession<S> {
  readonly account: Account;
  readonly scope: Scope.Closeable;
  readonly status: StatusCell;
  readonly failures: number;
  value: S | null;
}

/** One Backend at work: what runs on it, its Accounts as last told, and
 * what the Gate holds there. */
interface Running<S, B> {
  readonly backend: Backend;
  readonly runtime: ManagedRuntime.ManagedRuntime<Accounts | B, never>;
  readonly accounts: Accounts['Service'];
  readonly fibers: Array<Fiber.Fiber<unknown, unknown>>;
  state: AccountsState;
  /** When the Backend last said who is signed in. */
  verifiedAt: Date | null;
  /** Whether the last check failed with nobody to open without it. */
  unreachable: boolean;
  lost: LostAccount | null;
  session: OpenSession<S> | null;
  /** The account that would not open, until the User tries again. */
  unopenable: Account | null;
  /** The account an Account Switch is on its way to. */
  switching: Account | null;
  switches: Promise<unknown>;
  signingOut: boolean;
  /** Whose Copies were last kept. */
  kept: string | null;
}

const CHECKING = { kind: 'checking' } as const;

// How often an open account is confirmed, besides when asked.
const RECHECK = 60_000;

/** The Account `state` acts as: the Active Account, or while checking the
 * one last seen here (Open First). */
const activeOf = (state: AccountsState): Account | null =>
  state._tag === 'SignedIn'
    ? state.active
    : state._tag === 'Checking'
      ? (state.last ?? null)
      : null;

const signedInOf = (state: AccountsState): ReadonlyArray<Account> =>
  state._tag === 'SignedIn' ? state.accounts : [];

const messageOf = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  return error instanceof Error
    ? error.message
    : 'Sign in didn’t finish. Try again.';
};

/**
 * The Gate: runs sign-in on one device for one app, on auth-toolkit's
 * `Accounts`. It keeps the app on the Backend chosen, and the Active
 * Account's Session open while that Account stays active: at launch at
 * once from the Account last seen (Open First), confirmed when the Backend
 * answers. It holds the app on an Account Lost until the User acts. Nothing
 * runs until something first asks. Make one per app.
 */
export const createGate = <S, B>(config: GateConfig<S, B>) => {
  let made: Host | undefined;
  const host = () => (made ??= config.host());
  let remembering: ReturnType<typeof gateMemory> | undefined;
  const memory = () =>
    (remembering ??= gateMemory(host().storage.table(gateTable, 'gate')));
  const remember = (
    change: Parameters<ReturnType<typeof memory>['update']>[0],
  ) => Effect.runPromise(memory().update(change));

  // Accounts this device signed out itself, in this tab or another: their
  // going is no Account Lost.
  const quiet = new Set<string>();

  // Asks who signs in on the Local Backend; the Local Sign-In answers.
  const chooser = localChooser();
  const loadLocal = config.local;

  // A Backend this app does not have stands for the cloud.
  const offered = (backend: Backend | null): Backend | null =>
    backend === 'local' && loadLocal === undefined ? 'cloud' : backend;

  let running: Running<S, B> | null = null;
  let view: GateView<S> = CHECKING;
  // Every change of Backend waits for the one before it.
  let queue: Promise<void> = Promise.resolve();
  let booted = false;
  const listeners = new Set<() => void>();
  const notices: GateNotice[] = [];

  const viewOf = (r: Running<S, B> | null): GateView<S> => {
    if (r === null) return CHECKING;
    if (r.signingOut) return { kind: 'signingOut' };
    const signedIn = signedInOf(r.state);
    if (r.lost !== null) {
      const { account } = r.lost;
      return {
        kind: 'accountLost',
        account,
        accounts: signedIn.filter(({ id }) => id !== account.id),
      };
    }
    if (r.unopenable !== null)
      return { kind: 'unopenable', account: r.unopenable };
    if (r.switching !== null) return { kind: 'opening', account: r.switching };
    const open = r.session;
    if (open !== null) {
      if (open.value === null)
        return { kind: 'opening', account: open.account };
      return {
        kind: 'open',
        session: open.value,
        account: open.account,
        accounts: r.state._tag === 'SignedIn' ? signedIn : [open.account],
      };
    }
    if (r.state._tag === 'SignedOut')
      return { kind: 'signedOut', unreachable: false };
    if (r.state._tag === 'Checking')
      return r.unreachable
        ? { kind: 'signedOut', unreachable: true }
        : CHECKING;
    return { kind: 'opening', account: r.state.active };
  };

  const notify = () => {
    view = viewOf(running);
    listeners.forEach((listener) => listener());
  };

  const push = (notice: GateNotice) => {
    notices.push(notice);
    notify();
  };

  // Nobody awaits what the Gate does by itself, so a failure is logged
  // rather than lost.
  const report = (failed: unknown) =>
    Effect.runFork(Effect.logError('The Gate could not go on', failed));

  const statusOf = (r: Running<S, B>, account: Account) =>
    r.state._tag === 'SignedIn' && r.state.active.id === account.id
      ? { state: 'verified' as const, lastVerifiedAt: r.verifiedAt }
      : { state: 'verifying' as const, lastVerifiedAt: null };

  // Deletes what the device keeps for anyone no longer signed in here,
  // whenever who that is changes.
  const keep = (r: Running<S, B>) => {
    if (config.keep === undefined) return;
    const ids = signedInOf(r.state).map(({ id }) => id);
    if (r.lost !== null) ids.push(r.lost.account.id);
    const kept = ids.join('\n');
    if (kept === r.kept) return;
    r.kept = kept;
    r.runtime.runFork(config.keep(ids));
  };

  const setLost = (r: Running<S, B>, lost: LostAccount | null) => {
    r.lost = lost;
    void remember((all) => ({ ...all, [r.backend]: lost })).catch(report);
  };

  const closeSession = (r: Running<S, B>) => {
    const open = r.session;
    r.session = null;
    // Not waited for, so the next account opens without waiting for this
    // one to finish ending.
    if (open !== null) r.runtime.runFork(Scope.close(open.scope, Exit.void));
  };

  const openSession = (r: Running<S, B>, account: Account, failures = 0) => {
    const status = Effect.runSync(makeStatus(statusOf(r, account)));
    const open: OpenSession<S> = {
      account,
      scope: Effect.runSync(Scope.make()),
      status,
      failures,
      value: null,
    };
    r.session = open;
    void r.runtime
      .runPromiseExit(
        config.session(account, status).pipe(Scope.provide(open.scope)),
      )
      .then((exit) => {
        if (r.session !== open) return;
        if (Exit.isSuccess(exit)) {
          open.value = exit.value;
        } else {
          closeSession(r);
          if (failures + 1 >= 2) r.unopenable = account;
          else openSession(r, account, failures + 1);
        }
        notify();
      }, report);
  };

  /** Opens the Session of the account `r` acts as, closing any other. */
  const follow = (r: Running<S, B>) => {
    const wanted =
      r.lost !== null || r.signingOut || r.switching !== null
        ? null
        : activeOf(r.state);
    if (r.unopenable !== null) {
      if (wanted?.id === r.unopenable.id) return;
      r.unopenable = null;
    }
    const open = r.session;
    if (open !== null && open.account.id === wanted?.id) {
      open.status.set(statusOf(r, open.account));
      return;
    }
    closeSession(r);
    if (wanted !== null) openSession(r, wanted);
  };

  /** What an answer from the Backend means: the open account no longer
   * named, and not signed out here, is lost; a lost account named again, or
   * someone new signed in, is lost no more. */
  const answered = (r: Running<S, B>, state: AccountsState) => {
    const ids = signedInOf(state).map(({ id }) => id);
    r.unreachable = false;
    r.verifiedAt = new Date();
    const { lost } = r;
    const open = r.session?.account ?? null;
    if (lost !== null) {
      const back =
        ids.includes(lost.account.id) ||
        ids.some((id) => !lost.seen.includes(id));
      if (back) setLost(r, null);
    } else if (
      open !== null &&
      !ids.includes(open.id) &&
      !quiet.delete(open.id)
    ) {
      closeSession(r);
      setLost(r, { account: open, seen: ids });
    }
    // An account signed out here is gone now, so it is quiet no longer.
    for (const id of quiet) if (!ids.includes(id)) quiet.delete(id);
    keep(r);
  };

  const onState = (r: Running<S, B>, state: AccountsState) => {
    if (running !== r) return;
    r.state = state;
    if (state._tag !== 'Checking') answered(r, state);
    follow(r);
    notify();
  };

  /** Asks the Backend again who is signed in. With nobody to open, a
   * Backend out of reach shows as signed out, unreachable. */
  const check = (r: Running<S, B>) =>
    void r.runtime.runPromiseExit(r.accounts.check).then((exit) => {
      if (running !== r || Exit.isSuccess(exit)) return;
      if (r.state._tag === 'Checking' && r.state.last === undefined) {
        r.unreachable = true;
        notify();
      }
    }, report);

  const start = async (backend: Backend): Promise<Running<S, B>> => {
    const layer =
      backend === 'local' && loadLocal !== undefined
        ? await loadLocal(chooser.choose)
        : config.cloud();
    const runtime = ManagedRuntime.make(layer);
    const accounts = await runtime.runPromise(
      Effect.gen(function* () {
        return yield* Accounts;
      }),
    );
    const r: Running<S, B> = {
      backend,
      runtime,
      accounts,
      fibers: [],
      state: await runtime.runPromise(accounts.current),
      verifiedAt: null,
      unreachable: false,
      lost: (await Effect.runPromise(memory().read))[backend],
      session: null,
      unopenable: null,
      switching: null,
      switches: Promise.resolve(),
      signingOut: false,
      kept: null,
    };
    return r;
  };

  // Starts listening once `r` is the one running, so nothing it hears is
  // lost and nothing before it is heard.
  const listen = (r: Running<S, B>) => {
    r.fibers.push(
      r.runtime.runFork(
        Stream.runForEach(r.accounts.state, (state) =>
          Effect.sync(() => onState(r, state)),
        ),
      ),
      r.runtime.runFork(
        Effect.sleep(RECHECK).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (r.session?.value != null) check(r);
            }),
          ),
          Effect.forever,
        ),
      ),
    );
    if (r.state._tag === 'Checking' && r.state.last === undefined) check(r);
  };

  const stop = async (r: Running<S, B>) => {
    closeSession(r);
    await Effect.runPromise(
      Effect.forEach(r.fibers, (fiber) => Fiber.interrupt(fiber), {
        discard: true,
      }),
    );
    await r.runtime.dispose();
  };

  /** Runs on `backend`, ending whatever ran before. */
  const runOn = (backend: Backend) => {
    const change = queue.then(async () => {
      if (running?.backend === backend) return;
      const previous = running;
      running = null;
      notify();
      if (previous !== null) await stop(previous);
      const next = await start(backend);
      running = next;
      listen(next);
      follow(next);
      notify();
    });
    // A change that failed must not stop the ones after it.
    queue = change.catch(() => {});
    return change;
  };

  const chosenBackend = async (): Promise<Backend> =>
    offered(backendNamed((await Effect.runPromise(memory().read)).backend)) ??
    'cloud';

  // A Backend the launch asked for is chosen as if by hand.
  const settledBackend = async (): Promise<Backend> => {
    const asked = offered(host().lifecycle.launchBackend());
    if (asked === null) return chosenBackend();
    await remember((all) => ({ ...all, backend: asked }));
    return asked;
  };

  const checkAgain = () => {
    if (running !== null) check(running);
  };

  // Follows what another tab changed: the Backend it chose, or the account
  // it found lost or forgot. Who is signed in comes with the Accounts.
  const lookAgain = () =>
    Effect.runPromise(memory().read)
      .then((all) => {
        const backend = offered(backendNamed(all.backend)) ?? 'cloud';
        const r = running;
        if (r === null) return;
        if (r.backend !== backend) return runOn(backend);
        const lost = all[r.backend];
        if (lost?.account.id === r.lost?.account.id) return;
        r.lost = lost;
        if (lost !== null) closeSession(r);
        follow(r);
        notify();
      })
      .catch(report);

  const announce = (quietIds: ReadonlyArray<string>) =>
    host().tabs?.announce({ quiet: quietIds });

  /** Starts on the Backend chosen, once, and looks again whenever the app
   * comes back into view, the network comes back, or another tab changes
   * something. */
  const boot = () => {
    if (booted) return;
    booted = true;
    const { lifecycle, tabs } = host();
    settledBackend().then(runOn).catch(report);
    lifecycle.onOnlineChange(() => {
      if (lifecycle.online()) checkAgain();
    });
    lifecycle.onForeground(() => void lookAgain());
    tabs?.listen((message) => {
      for (const id of message.quiet) quiet.add(id);
      void lookAgain();
    });
  };

  const subscribe = (changed: () => void) => {
    boot();
    listeners.add(changed);
    return () => void listeners.delete(changed);
  };

  const online = () => host().lifecycle.online();

  /** Whether a sign-out can happen now: only the Backend can end a sign-in,
   * so the cloud Backend has to be reachable. */
  const canSignOut = () => running?.backend === 'local' || online();

  // Forgets the lost account, which deletes its Copy, and tells the other
  // tabs.
  const forget = (r: Running<S, B>) => {
    const { lost } = r;
    if (lost === null) return;
    setLost(r, null);
    keep(r);
    announce([lost.account.id]);
  };

  /** Signs `ids` out, with `run`, as this device's own doing. */
  const signOutOf = (
    ids: ReadonlyArray<string>,
    run: (accounts: Accounts['Service']) => Effect.Effect<void, unknown>,
  ): boolean => {
    const r = running;
    if (r === null || !canSignOut()) return false;
    for (const id of ids) quiet.add(id);
    announce(ids);
    r.signingOut = true;
    r.unopenable = null;
    closeSession(r);
    notify();
    void r.runtime.runPromiseExit(run(r.accounts)).then((exit) => {
      if (Exit.isFailure(exit)) for (const id of ids) quiet.delete(id);
      r.signingOut = false;
      if (running !== r) return;
      follow(r);
      notify();
    }, report);
    return true;
  };

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
      host().lifecycle.onOnlineChange(changed),
    canSignOut,

    /** Chooses `backend` and runs on it at once. Each Backend keeps its own
     * Accounts. */
    setBackend: async (asked: Backend) => {
      const backend = offered(asked) ?? 'cloud';
      await remember((all) => ({ ...all, backend }));
      await runOn(backend);
      announce([]);
    },

    /** An Account Switch, browser-wide: the open Session closes at once, and
     * the account opens once the Backend has switched. The last of several
     * quick switches wins. From an Account Lost, the lost account's Copy is
     * deleted. */
    switchTo: (userId: string) => {
      const r = running;
      if (r === null) return;
      const to = signedInOf(r.state).find(({ id }) => id === userId);
      if (to === undefined) return;
      const wasLost = r.lost !== null;
      forget(r);
      if (!wasLost && r.switching === null && r.session?.account.id === userId)
        return;
      r.switching = to;
      r.unopenable = null;
      closeSession(r);
      notify();
      const run = r.switches.then(() =>
        r.switching?.id === userId
          ? r.runtime.runPromiseExit(r.accounts.switchTo(userId))
          : undefined,
      );
      r.switches = run.catch(() => {});
      void run.then(() => {
        if (r.switching?.id !== userId) return;
        r.switching = null;
        if (running !== r) return;
        follow(r);
        notify();
      }, report);
    },

    /** Signs one more account in, who becomes the Active Account. On the
     * cloud Backend the page leaves for the sign-in service; on the Local
     * Backend the Local Sign-In asks who. */
    addAccount: async () => {
      const r = running;
      if (r === null) return;
      const exit = await r.runtime.runPromiseExit(r.accounts.signIn());
      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
        push({ kind: 'signInFailed', message: messageOf(exit.cause) });
    },

    /** Signs the Active Account out of this device; whoever is left opens.
     * From an Account Lost, forgets the lost account and deletes its Copy.
     * False, and nothing happens, when the Backend can't be reached. */
    signOut: (): boolean => {
      const r = running;
      if (r === null) return false;
      // Forgetting a lost account needs no Backend.
      if (r.lost !== null) {
        forget(r);
        follow(r);
        notify();
        return true;
      }
      const target = r.session?.account ?? r.unopenable ?? activeOf(r.state);
      if (target === null) return false;
      return signOutOf([target.id], (accounts) => accounts.signOut(target.id));
    },

    /** Signs every account out of this device. False, and nothing happens,
     * when the Backend can't be reached. */
    signOutEveryone: (): boolean =>
      running !== null &&
      signOutOf(
        signedInOf(running.state).map(({ id }) => id),
        (accounts) => accounts.signOutAll,
      ),

    /** Asks the Backend again who is signed in. */
    checkAgain,

    /** Tries again to open an account that would not open. */
    retry: () => {
      const r = running;
      if (r === null || r.unopenable === null) return;
      r.unopenable = null;
      follow(r);
      notify();
    },

    /** The oldest Gate Notice not yet taken, once; null when none. */
    takeNotice: (): GateNotice | null => {
      const notice = notices.shift() ?? null;
      if (notice !== null) notify();
      return notice;
    },
    /** The oldest Gate Notice not yet taken, without taking it. */
    notice: (): GateNotice | null => notices[0] ?? null,

    /** Whether the Local Backend is asking who signs in, and how to answer:
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
