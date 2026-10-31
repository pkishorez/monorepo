// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts starts and stops the Runtime, which lives outside React.
import { Suspense, use, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Cause, Effect, Exit, Fiber, Scope } from 'effect';
import type { Layer } from 'effect';
import { History, Runtime } from '../../core/index.ts';
import type {
  AnyActor,
  Entry,
  LiveInstance,
  Needs,
  Provided,
  Running,
  SavedHistory,
  Snapshot,
  WorkerStatus,
} from '../../core/index.ts';
import { makeDrawn } from './drawn.ts';
import { AppContext, LazyContext } from '../view/index.ts';
import type { DrawnApp, LazyView, ViewOf } from '../view/index.ts';
import { registry } from './registry.ts';

/*
 * The App: an Actor tree with its Layer, as one React component. It draws
 * the Snapshot at the Step shown, or live, and each View draws its Instance
 * from it.
 *
 * 1. Draw   before it runs, on a server too: the History's Head, replayed
 *           through Suspense when it is longer than one entry. A History
 *           given when drawn (`saved`) is drawn on its own, so a server
 *           draws each request's; the first mount takes it as the app's.
 * 2. Mount  the first mount starts one Runtime on the History; the last
 *           unmount stops it and leaves the History for the next mount of an
 *           app with this name, after a hot reload too. A start, stop or
 *           clear that fails is logged and kept as the app's failure. Each
 *           Attachment is called with the running app at the first mount,
 *           and stopped at the last unmount; one that throws is logged, and
 *           the rest run on.
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
   * How many entries its History keeps on the Head's Branch; the last 100
   * by default, and `null` keeps every one. `history.keep` changes it later, and the change is remembered
   * in the browser under the app's name, so it outlasts a reload and wins
   * over this.
   */
  readonly window?: number | null;
  /**
   * What runs beside the app in a browser, such as a devtool: each is called
   * with the running app when it is first mounted, and what it returns when
   * the last mount goes, as after a hot reload. Never on a server.
   */
  readonly attach?: ReadonlyArray<Attachment>;
}

/** Something outside the app that runs beside its Runtime: called with the running app, it returns how to stop. */
export type Attachment<A = AnyActor> = (runtime: AppRuntime<A>) => () => void;

/** The running app, for code outside the tree: a timeline, a devtool. */
export interface AppRuntime<A = AnyActor> {
  /** What the app is called: `AppOptions.name`, or the root Actor's name. */
  readonly name: string;
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
  /** The Capabilities an Instance provides to everything under it now, by key. Empty while stopped. */
  readonly provided: (instance: string) => Provided;
  /** The root Instance, typed and live, Sending from outside named `from`; `null` until the Runtime starts. */
  readonly instance: (options: {
    readonly from: string;
  }) => LiveInstance<A> | null;
  /** Why the last start, stop or clear failed, also logged; `null` once one succeeds. */
  readonly failure: Cause.Cause<unknown> | null;
  /** Calls `listener` whenever anything here changes; returns how to stop. */
  readonly subscribe: (listener: () => void) => () => void;
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
    if (stored !== undefined && Number.isInteger(count) && count >= 0)
      return { window: count };
    return { window: options.window === undefined ? 100 : options.window };
  };
  let written: number | null | undefined;
  const remember = (window: number | null) => {
    if (written === undefined) written = keptWindow().window;
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
  /** The History an app of this name holds or left, read with this code from the Input it was made with, else its own. */
  const adopt = () => {
    const left = registry.history(name);
    return left
      ? History.load(actor, left.save(), {
          window: left.window(),
          input: left.input,
        })
      : own();
  };

  /** The drawing of the app's own History: what the Runtime runs and `useRuntime` reads. */
  let mine: Draw<A> | undefined;
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
  const subscribe: DrawnApp['subscribe'] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  /** One History drawn: the app's own, or one given when drawn, which only the app's own Runtime ever runs. */
  const makeDraw = (history: History<A>): Draw<A> => {
    const draw: Draw<A> = { history, first: undefined, drawn: undefined! };
    const live = () =>
      shown === null ? (runtime?.snapshot() ?? draw.first?.snapshot) : past;
    draw.drawn = makeDrawn(
      () => (draw === mine ? live() : draw.first?.snapshot),
      () => draw.first?.snapshot,
      (id, message) => {
        if (draw === mine && shown === null)
          runtime?.send(id, message, { kind: 'view', instance: id });
      },
      subscribe,
      () => draw === mine && shown === null,
    );
    return draw;
  };

  let unwatch = () => {};
  const take = (next: Draw<A>) => {
    unwatch();
    mine = next;
    const { history } = next;
    unwatch = history.subscribe(() => {
      if (typeof shown === 'number' && !history.has(shown))
        show(history.branch()[0]?.id ?? 'init');
      remember(history.window());
      changed();
    });
    return next;
  };
  const whose = () => mine;
  const mineOf = () => mine ?? take(makeDraw(adopt()));
  const historyOf = () => mineOf().history;

  /** The drawing of a History given when drawn, one per saved History, so a draw that suspends finds it again. */
  const given = new WeakMap<SavedHistory, Draw<A>>();
  const givenOf = (saved: SavedHistory) => {
    let draw = given.get(saved);
    if (!draw)
      given.set(
        saved,
        (draw = makeDraw(History.load(actor, saved, keptWindow()))),
      );
    return draw;
  };
  /** Until the app has a History of its own, a given one is drawn as it is. */
  const takesGiven = (saved: SavedHistory | undefined): saved is SavedHistory =>
    saved !== undefined && mounts === 0 && !registry.history(name);

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
  /**
   * Start replaying a History to its Head, once: what the app draws before
   * its Runtime starts. Init, or one entry such as a Restore, is drawn at
   * once; a longer Branch is replayed without blocking the page.
   */
  const firstDraw = (draw: Draw<A>): FirstDraw => {
    if (draw.first) return draw.first;
    const from = draw.history;
    const head = from.head();
    const first: FirstDraw = { snapshot: undefined, replaying: undefined! };
    first.replaying =
      head === null || from.branch(head).length <= 1
        ? fulfilled((first.snapshot = from.snapshotAt(head)))
        : tracked(
            Effect.runPromise(from.seek()).then((snapshot) => {
              first.snapshot = snapshot;
              changed();
              return snapshot;
            }),
          );
    return (draw.first = first);
  };

  /**
   * Wait for the first Snapshot: React shows the fallback until it is
   * replayed. Called on every draw, even once replayed or with the Runtime
   * started, since React wants a draw that suspended on use() to call it
   * again; the thenable is fulfilled by then, so it returns at once.
   */
  const waitForFirstDraw = (draw: Draw<A>) => {
    use(firstDraw(draw).replaying);
  };

  // 2. Mount
  let mounts = 0;
  let close = () => {};
  let detach = () => {};
  let unsubscribe = () => {};
  const mount = (saved: SavedHistory | undefined) => {
    if (takesGiven(saved)) take(givenOf(saved));
    if (mounts++ === 0) {
      if (!registry.claim(name, app, historyOf())) {
        console.error(
          `[@kestack/kabuki] two apps named ${name} are mounted at once; they cannot share a History`,
        );
        take(makeDraw(own()));
        changed();
      }
      detach = attach();
      let open = true;
      close = () => {
        open = false;
      };
      firstDraw(mineOf()).replaying.then(
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
        detach();
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

  /** Each Attachment called with the running app; returns how to stop them all. */
  const attach = () => {
    const stops = (options.attach ?? []).flatMap((attachment) => {
      try {
        return [attachment(live)];
      } catch (error) {
        console.error(
          `[@kestack/kabuki] ${name} could not start an Attachment`,
          error,
        );
        return [];
      }
    });
    return () => {
      for (const stop of stops) {
        try {
          stop();
        } catch (error) {
          console.error(
            `[@kestack/kabuki] ${name} could not stop an Attachment`,
            error,
          );
        }
      }
    };
  };

  const read = () =>
    (seen ??= {
      head: historyOf().head(),
      running: runtime?.running() ?? false,
      shown,
      failure,
    });

  /** The running app, always read as it is now: what an Attachment holds and `useRuntime` returns. */
  const live: AppRuntime<A> = {
    name,
    get history() {
      return historyOf();
    },
    get branch() {
      return historyOf().branch(read().head);
    },
    get head() {
      return read().head;
    },
    get running() {
      return read().running;
    },
    get shown() {
      return read().shown;
    },
    get failure() {
      return read().failure;
    },
    show,
    start,
    stop,
    clear,
    workers: (instance) => runtime?.workers(instance) ?? NO_WORKERS,
    provided: (instance) =>
      runtime?.provided(instance) ?? { top: [], state: [] },
    instance: (options) => runtime?.instance(options) ?? null,
    subscribe,
  };

  const Drawn = ({ draw }: { readonly draw: Draw<A> }) => {
    waitForFirstDraw(draw);
    return (
      <AppContext value={draw.drawn}>
        <RootView instance={root} />
      </AppContext>
    );
  };

  const App = ({ fallback = null, saved, onLazyView }: AppProps) => {
    // The History given is read once, at the first mount, like `input`.
    useEffect(() => mount(saved), []);
    // Drawn again when the app takes another History of its own.
    useSyncExternalStore(subscribe, whose, whose);
    const draw = takesGiven(saved) ? givenOf(saved) : mineOf();
    const drawn = (
      <Suspense fallback={fallback}>
        <Drawn draw={draw} />
      </Suspense>
    );
    return onLazyView ? (
      <LazyContext value={onLazyView}>{drawn}</LazyContext>
    ) : (
      drawn
    );
  };

  return Object.assign(App, {
    displayName: name,
    useRuntime: (): AppRuntime<A> => {
      // Drawn again on each change; the object stays the same, as an Attachment's does.
      useSyncExternalStore(subscribe, read, read);
      return live;
    },
  });
};

/** What the App component takes. */
export interface AppProps {
  /** Drawn while the History is replayed, or a lazy View loaded. */
  readonly fallback?: ReactNode;
  /**
   * A History to draw, given when the App is drawn, so a server draws each
   * request's own: drawn at its Head with no Runtime, as `options.saved` is.
   * The first mount in a browser takes it as the app's History and starts
   * the Runtime from it, unless an app of this name has one already, as
   * after a hot reload. Read once: a later one is not drawn.
   */
  readonly saved?: SavedHistory;
  /** Told of every lazy View this drawing draws, so a server can preload their code in the page. */
  readonly onLazyView?: (view: LazyView<AnyActor>) => void;
}

/** One History, drawn: the app's own, or one given when the App is drawn. */
interface Draw<A> {
  readonly history: History<A>;
  first: FirstDraw | undefined;
  drawn: DrawnApp;
}

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
