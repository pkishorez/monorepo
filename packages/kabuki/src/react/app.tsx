// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts starts and stops the Runtime, which lives outside React.
import { Suspense, use, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Cause, Effect, Exit, Fiber, Scope } from 'effect';
import type { Layer } from 'effect';
import { History, Runtime } from '../core/index.ts';
import type {
  AnyActor,
  Entry,
  Needs,
  Running,
  SavedHistory,
  Snapshot,
  WorkerStatus,
} from '../core/index.ts';
import { makeDrawn } from './drawn.ts';
import { registry } from './registry.ts';
import { AppContext } from './view.tsx';
import type { ViewOf } from './view.tsx';

/*
 * The App: an Actor tree with its Layer, as one React component. It draws
 * the Snapshot at the Step shown, or live, and each View draws its Instance
 * from it.
 *
 * 1. Draw   before it runs, on a server too: the History's Head, replayed
 *           through Suspense.
 * 2. Mount  the first mount starts one Runtime on the History; the last
 *           unmount stops it and leaves the History for the next mount of an
 *           app with this name, after a hot reload too. A start, stop or
 *           clear that fails is logged and kept as the app's failure.
 * 3. Show   any Step: the Views draw the Snapshot right after it, while
 *           the live app runs on underneath. A Send from the past is
 *           dropped. A Step Compacted away shows the oldest one left.
 * 4. Keep   the History's Window, once changed, in `localStorage` under the
 *           app's name, and start from it after a reload.
 */

type Unmet<A, Provided> = [Exclude<Needs<A>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingCapabilities: Exclude<Needs<A>, Provided> }];

/** A Step: right after an entry, or right after init. */
type Step = number | 'init';

export interface AppOptions {
  /**
   * What the app is called: the History its last mount leaves is picked up
   * by the next mount of an app with this name, after a hot reload too. By
   * default the root Actor's name.
   */
  readonly name?: string;
  /** A History saved before: the app is first drawn at its Head, and its Runtime carries on from there. */
  readonly saved?: SavedHistory;
  /**
   * The root's Input, read once, when the app first makes its History: not
   * for a saved History, nor one a hot reload left. A function, so it can
   * read what is only there at that moment, like the browser's URL.
   */
  readonly input?: () => unknown;
  /**
   * How many entries its History keeps on the Head's Branch; every one by
   * default. `history.keep` changes it later, and the change is remembered
   * in the browser under the app's name, so it outlasts a reload and wins
   * over this.
   */
  readonly window?: number | null;
}

/** The running app, for code outside the tree: a timeline, a devtool. */
export interface AppRuntime<A = AnyActor> {
  readonly history: History<A>;
  /** The current Branch: every entry from the first to the Head. */
  readonly branch: ReadonlyArray<Entry>;
  readonly head: number | null;
  readonly running: boolean;
  /** The Step the Views show, or `null` for live. */
  readonly shown: Step | null;
  readonly show: (step: Step | null) => void;
  /** Start at the Head, or at an entry (`null`: init), growing a new Branch from it. */
  readonly start: (from?: number | null) => void;
  readonly stop: () => void;
  /** Forget the whole History and go live from init. */
  readonly clear: () => void;
  /** What an Instance's Workers are doing now. Empty while stopped. */
  readonly workers: (instance: string) => ReadonlyArray<WorkerStatus>;
  /** Why the last start, stop or clear failed, also logged; `null` once one succeeds. */
  readonly failure: Cause.Cause<unknown> | null;
}

const NO_WORKERS: ReadonlyArray<WorkerStatus> = [];

export const toReact = <A extends AnyActor, Provided>(
  actor: A,
  view: ViewOf<A>,
  layer: Layer.Layer<Provided, never, never>,
  options: AppOptions = {},
  ..._unmet: Unmet<A, Provided>
) => {
  const RootView = view;
  const name = options.name ?? actor.definition.name;
  const root = { id: actor.definition.name };
  const app = {};

  // 4. Keep
  const windowKey = `@kestack/kabuki:${name}:window`;
  /** The Window this app was left with, else the one it is given. */
  const keptWindow = () => {
    const stored = readStored(windowKey);
    if (stored === 'all') return { window: null };
    const count = Number(stored);
    if (stored !== undefined && Number.isInteger(count) && count >= 1)
      return { window: count };
    return options.window === undefined ? {} : { window: options.window };
  };
  let written: number | null | undefined;
  const remember = (window: number | null) => {
    if (written === undefined) written = keptWindow().window ?? null;
    if (window === written) return;
    written = window;
    writeStored(windowKey, window === null ? 'all' : `${window}`);
  };

  const own = () =>
    options.saved
      ? History.load(actor, options.saved, keptWindow())
      : History.make(actor, {
          ...keptWindow(),
          ...(options.input ? { input: options.input() } : {}),
        });
  /** The History an app of this name holds or left, read with this code, else its own. */
  const adopt = () => {
    const left = registry.history(name);
    return left
      ? History.load(actor, left.save(), { window: left.window() })
      : own();
  };

  let history: History<A> | undefined;
  let first: FirstDraw | undefined;
  let runtime: Running<A> | undefined;
  let shown: Step | null = null;
  let past: Snapshot | undefined;
  let failure: Cause.Cause<unknown> | null = null;

  const listeners = new Set<() => void>();
  let seen: Seen | undefined;
  const changed = () => {
    seen = undefined;
    for (const listener of listeners) listener();
  };

  let unwatch = () => {};
  const take = (next: History<A>) => {
    unwatch();
    history = next;
    first = undefined;
    unwatch = next.subscribe(() => {
      if (typeof shown === 'number' && !next.has(shown))
        show(next.branch()[0]?.id ?? 'init');
      remember(next.window());
      changed();
    });
    return next;
  };
  const historyOf = () => history ?? take(adopt());

  /** What came of a start, stop or clear: an interruption is a newer one taking over, not a failure. */
  const settled = (what: string) => (exit: Exit.Exit<unknown, unknown>) => {
    if (Exit.isSuccess(exit)) {
      if (failure === null) return;
      failure = null;
    } else {
      if (Cause.hasInterruptsOnly(exit.cause)) return;
      console.error(
        `[@kestack/kabuki] ${name} could not ${what}:\n${Cause.pretty(exit.cause)}`,
      );
      failure = exit.cause;
    }
    changed();
  };

  // 1. Draw
  /** Start replaying the History to its Head, once: what the app draws before its Runtime starts. */
  const firstDraw = (): FirstDraw => {
    if (first) return first;
    const from = historyOf();
    const draw: FirstDraw = { snapshot: undefined, replaying: undefined! };
    draw.replaying =
      from.head() === null
        ? fulfilled((draw.snapshot = from.snapshotAt(null)))
        : tracked(
            Effect.runPromise(from.seek()).then((snapshot) => {
              draw.snapshot = snapshot;
              changed();
              return snapshot;
            }),
          );
    return (first = draw);
  };

  /** Before the Runtime starts, wait for the first Snapshot: React shows the fallback until it is replayed. */
  const waitForFirstDraw = () => {
    const { snapshot, replaying } = firstDraw();
    if (!snapshot) use(replaying);
  };

  const snapshot = () =>
    shown === null ? (runtime?.snapshot() ?? first?.snapshot) : past;

  const drawn = makeDrawn(
    snapshot,
    () => first?.snapshot,
    (id, message) => {
      if (shown === null)
        runtime?.send(id, message, { kind: 'view', instance: id });
    },
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  );

  // 2. Mount
  let mounts = 0;
  let close = () => {};
  let unsubscribe = () => {};
  const mount = () => {
    if (mounts++ === 0) {
      if (!registry.claim(name, app, historyOf())) {
        console.error(
          `[@kestack/kabuki] two apps named ${name} are mounted at once; they cannot share a History`,
        );
        take(own());
        changed();
      }
      let open = true;
      close = () => {
        open = false;
      };
      firstDraw().replaying.then(
        () => {
          if (!open) return;
          close = host(historyOf(), layer, (exit) => {
            if (Exit.isSuccess(exit)) {
              unsubscribe();
              runtime = exit.value;
              unsubscribe = exit.value.subscribe(changed);
              changed();
            }
            settled('start')(exit);
          });
        },
        (error: unknown) => {
          console.error(
            `[@kestack/kabuki] ${name} could not be drawn, so its Runtime did not start`,
            error,
          );
        },
      );
    }
    return () => {
      if (--mounts === 0) {
        registry.release(name, app);
        close();
      }
    };
  };

  // 3. Show
  let showing: Fiber.Fiber<void> | undefined;
  const show = (step: Step | null) => {
    showing?.interruptUnsafe();
    if (step === null) {
      shown = null;
      past = undefined;
      return changed();
    }
    showing = Effect.runFork(
      historyOf()
        .seek(step === 'init' ? null : step)
        .pipe(
          Effect.map((snapshot) => {
            past = snapshot;
            shown = step;
            changed();
          }),
        ),
    );
  };

  const control = (what: string, effect: Effect.Effect<void> | undefined) => {
    if (effect) Effect.runFork(effect).addObserver(settled(what));
  };
  const start = (from?: number | null) =>
    control('start', runtime?.start(from));
  const stop = () => control('stop', runtime?.stop());
  const clear = () =>
    control(
      'clear its History',
      Effect.gen(function* () {
        yield* runtime?.stop() ?? Effect.void;
        historyOf().clear();
        yield* runtime?.start() ?? Effect.void;
      }),
    );

  const read = () =>
    (seen ??= {
      head: historyOf().head(),
      running: runtime?.running() ?? false,
      shown,
      failure,
    });

  const Drawn = () => {
    if (!runtime) waitForFirstDraw();
    return (
      <AppContext value={drawn}>
        <RootView instance={root} />
      </AppContext>
    );
  };

  const App = ({ fallback = null }: { readonly fallback?: ReactNode }) => {
    useEffect(mount, []);
    return (
      <Suspense fallback={fallback}>
        <Drawn />
      </Suspense>
    );
  };

  return Object.assign(App, {
    displayName: name,
    useRuntime: (): AppRuntime<A> => {
      const { head, running, shown, failure } = useSyncExternalStore(
        drawn.subscribe,
        read,
        read,
      );
      return {
        history: historyOf(),
        branch: historyOf().branch(head),
        head,
        running,
        shown,
        show,
        start,
        stop,
        clear,
        workers: (instance) => runtime?.workers(instance) ?? NO_WORKERS,
        failure,
      };
    },
  });
};

/** What useRuntime reads, the same object until something changes. */
interface Seen {
  readonly head: number | null;
  readonly running: boolean;
  readonly shown: Step | null;
  readonly failure: Cause.Cause<unknown> | null;
}

/** The History's Head, replayed: the first Snapshot drawn, before any Runtime. */
interface FirstDraw {
  /** Set once it is replayed. */
  snapshot: Snapshot | undefined;
  replaying: Thenable<Snapshot>;
}

/**
 * A promise with the `status` and `value` React's `use` reads, so one that
 * has settled renders without suspending, on a server and in a browser alike.
 */
type Thenable<T> = Promise<T>;

const fulfilled = <T,>(value: T): Thenable<T> =>
  Object.assign(Promise.resolve(value), { status: 'fulfilled', value });

const tracked = <T,>(promise: Promise<T>): Thenable<T> => {
  const thenable = Object.assign(promise, { status: 'pending' });
  promise.then(
    (value) => Object.assign(thenable, { status: 'fulfilled', value }),
    (reason: unknown) =>
      Object.assign(thenable, { status: 'rejected', reason }),
  );
  return thenable;
};

/**
 * Start the Runtime under one Scope, and say how the start went; a failed
 * one closes the Scope. Returns a function that closes the Scope: every
 * Command and Worker ends, then the Layer.
 */
const host = <A extends AnyActor>(
  history: History<A>,
  layer: Layer.Layer<any, never, never>,
  onSettled: (exit: Exit.Exit<Running<A>>) => void,
): (() => void) => {
  const scope = Scope.makeUnsafe();
  const starting = Effect.runFork(
    Runtime.start(history, ...([layer] as never)).pipe(Scope.provide(scope)),
  );
  starting.addObserver((exit) => {
    if (Exit.isFailure(exit)) void Effect.runPromise(Scope.close(scope, exit));
    onSettled(exit);
  });
  // A start still under way is interrupted first, so nothing is built into a
  // closed Scope (React StrictMode unmounts right after the first mount).
  return () => {
    void Effect.runPromise(
      Fiber.interrupt(starting).pipe(
        Effect.andThen(Scope.close(scope, Exit.void)),
      ),
    );
  };
};

/** A value kept in the browser, or nothing: on a server, or where storage is refused. */
const readStored = (key: string) => {
  try {
    return globalThis.localStorage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeStored = (key: string, value: string) => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {}
};
