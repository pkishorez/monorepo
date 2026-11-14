// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts makes and lets go of the Runtime, which lives outside React.
import { Suspense, use, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Effect, Layer } from 'effect';
import type { Fiber } from 'effect';
import { Snapshot } from '../../core/snapshot/index.ts';
import { History } from '../../core/history/index.ts';
import type { SavedHistory } from '../../core/history/index.ts';
import { Runtime } from '../../core/runtime/index.ts';
import type { Needs } from '../../core/runtime/index.ts';
import type { AnyActor } from '../../core/actor/index.ts';
import { makeDrawn } from './drawn.ts';
import { rootOf } from './kabuki.tsx';
import { AppContext, LazyContext } from './draw/index.ts';
import type { DrawnApp, LazyView, ViewOf } from './draw/index.ts';
import { registry } from './registry.ts';

/*
 * The App: an Actor tree with its Layer, as one React component that makes
 * and owns its one Runtime, and keeps the app's History beside it. It draws
 * the Runtime's Snapshot, or the Step it Seeks, and each View draws its
 * Instance from that Snapshot.
 *
 * 1. Draw    before it runs, on a server too: the History's Head, replayed
 *            through Suspense when it is longer than one entry. A History
 *            given when drawn (`saved`) is drawn on its own, so a server
 *            draws each request's; the first mount takes it as the app's.
 * 2. Mount   the first mount makes one Runtime from the Snapshot at the
 *            History's Head, running, and calls each Attachment with the
 *            app; the last unmount stops them, lets the Runtime go and
 *            leaves its History for the next mount of an app with this
 *            name, after a hot reload too. An Attachment that throws is
 *            logged, and the rest run on.
 * 3. Record  every entry the Runtime plays, into the History, kept to its
 *            Window.
 * 4. Seek    any entry, or the History's start: the Views draw that Step
 *            while the Runtime stays where it is underneath, and a Send
 *            from it is dropped, as is one while the Runtime is stopped,
 *            until they go back to the Head. A Fork moves the History's
 *            Head to any entry, and the same Runtime follows the Snapshot
 *            there, its work starting again; starting over gives the app a
 *            new History from init, which the Runtime follows the same
 *            way. A Seek, start, stop, Fork or start over that fails is
 *            logged and kept as the app's failure.
 * 5. Keep    the Window, once changed, in `localStorage` under the app's
 *            name, and start from it after a reload.
 */

type Unmet<A, Provided> = [Exclude<Needs<A>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingCapabilities: Exclude<Needs<A>, Provided> }];

/** What `View.app` takes besides the View: its options, and the Layer that gives what the tree Requires. */
export type AppSetup<Provided = never> = AppOptions & {
  readonly layer?: Layer.Layer<Provided, never, never>;
};

/** Any setup: every Layer is one, since the Layer of nothing is the widest. */
type AnySetup = AppOptions & {
  readonly layer?: Layer.Layer<never, never, never>;
};

/** What a setup's Layer gives for sure: nothing, unless the Layer is there. */
type ProvidedBy<S> = S extends {
  readonly layer: Layer.Layer<infer Provided, never, never>;
}
  ? Provided
  : never;

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
   * by default, and `null` keeps every one. `keep` changes it later, and
   * the change is remembered in the browser under the app's name, so it
   * outlasts a reload and wins over this.
   */
  readonly window?: number | null;
  /**
   * What runs beside the app in a browser, such as a devtool: each is called
   * with the app once its Runtime is made at the first mount, and what it
   * returns when the last mount goes, as after a hot reload. Never on a
   * server.
   */
  readonly attach?: ReadonlyArray<Attachment>;
}

/** Something outside the app that runs beside its Runtime: called with the app, it returns how to stop. */
export type Attachment<A = AnyActor> = (app: AppRuntime<A>) => () => void;

/** The app, for code outside the tree: a timeline, a devtool. Always read as it is now. */
export interface AppRuntime<A = AnyActor> {
  /** What the app is called: `AppOptions.name`, or the root Actor's name. */
  readonly name: string;
  /**
   * The app's one Runtime, the same through every Seek and Fork: `null`
   * until the app is first mounted and drawn, and on a server. Reach any
   * Instance from its `root`, or straight `at` its Address.
   */
  readonly runtime: Runtime<A> | null;
  /** The app's History: every entry its Runtime played, kept to the Window. */
  readonly history: History;
  /** How many entries the History keeps on the Head's Branch, or `null` for every one. */
  readonly window: number | null;
  /** Change the Window, and Compact the History to it now. */
  keep(window: number | null): void;
  /** The Step the Views draw, or `null` while they draw the Runtime's Snapshot. */
  readonly seeking: Step<A> | null;
  /**
   * Time Travel: draw the app right after an entry (`null`: the History's
   * start), on any Branch, while the Runtime stays where it is.
   */
  seek(entry: number | null): void;
  /** Stop Seeking: draw the Runtime's Snapshot again. */
  toHead(): void;
  /** Move the History's Head to an entry (`null`: its start): the Runtime follows the Snapshot there, its work starting again, and the next Message grows a new Branch. */
  fork(entry: number | null): void;
  /**
   * Start the app over from init, with the root's Input read again: a new
   * History with no entries, which the Runtime follows, its work starting
   * again. Where `fork(null)` goes to the History's start, which is init
   * only until the Window folds the oldest entries away, this always goes
   * to init.
   */
  startOver(): void;
  /** Run the Runtime again from its Snapshot. */
  start(): void;
  /** Stop all the Runtime's work; nothing can be Sent until it starts again. */
  stop(): void;
  /** What the last Seek, start, stop, Fork or start over failed at, and why, also logged; `null` once one succeeds. */
  readonly failure: Failure | null;
  /** Calls `listener` whenever anything here changes, the Runtime's Snapshot included; returns how to stop. */
  subscribe(listener: () => void): () => void;
}

/** The app right after one History entry (`null`: the History's start), as plain data: what a Seek draws. */
export interface Step<A = AnyActor> {
  readonly entry: number | null;
  /** Its Time: its Snapshot's. */
  readonly at: number;
  readonly snapshot: Snapshot<A>;
}

/** A Seek, start, stop, Fork or start over that failed. */
export interface Failure {
  /** What it could not do, as logged: `start`, `fork from 3`. */
  readonly what: string;
  readonly error: unknown;
}

/**
 * A View as the app: its Actor's tree run on one History, drawn as one
 * React component, `<App />`. What the tree Requires comes from
 * `setup.layer`; leaving out a Capability is a type error.
 */
export const app = <A extends AnyActor, S extends AnySetup = {}>(
  view: ViewOf<A>,
  setup?: S & AnySetup,
  // A Capability the tree Requires and the Layer leaves out asks for this.
  ..._unmet: Unmet<A, ProvidedBy<S>>
) => {
  const options: AppOptions = setup ?? {};
  const layer = setup?.layer as Layer.Layer<any, never, never> | undefined;
  const actor = view.actor;
  const startFrom = options.input ?? view.input;
  const RootView = view;
  const name = options.name ?? actor.name;
  const root = rootOf(actor);
  const app = {};

  // 5. Keep
  const windowKey = `@kestack/kabuki:${name}:window`;
  /** The Window this app was left with, else the one it is given. */
  const keptWindow = (): number | null => {
    const stored = readStored(windowKey);
    if (stored === 'all') return null;
    const count = Number(stored);
    if (stored !== undefined && Number.isInteger(count) && count >= 0)
      return count;
    return options.window === undefined ? 100 : options.window;
  };
  let written: number | null | undefined;
  const remember = (window: number | null) => {
    if (written === undefined) written = keptWindow();
    if (window === written) return;
    written = window;
    writeStored(windowKey, window === null ? 'all' : `${window}`);
  };

  /** A History with no entries, from the root's Input. */
  const fresh = () =>
    History.init(Snapshot.init(actor, startFrom ? startFrom() : undefined));
  /** A saved History read with this code, else a fresh one: one whose start no longer fits the code is warned of and left behind. */
  const read = (saved: SavedHistory) => {
    try {
      return History.load(actor, saved);
    } catch (error) {
      console.warn(
        `[@kestack/kabuki] ${name} starts over: ${(error as Error).message}`,
      );
      return fresh();
    }
  };
  const own = () => (options.saved ? read(options.saved) : fresh());
  /** The History an app of this name holds or left, read with this code, else its own. */
  const adopt = () => {
    const left = registry.left(name);
    if (!left) return own();
    if (left.actor === actor) return left.history;
    return read(History.save(left.actor, left.history));
  };

  /** The drawing of the app's own History: what its Runtime is made on, and the Runtime and Steps it draws after. */
  let mine: Draw | undefined;
  let runtime: Runtime<A> | null = null;
  /** The app's History while its Runtime is made: what it started from, and every entry played since. */
  let history: History | undefined;
  /** The Window the History is kept to, once the app has read or changed it. */
  let keeping: number | null | undefined;
  let seeking: Step<A> | null = null;
  let failure: Failure | null = null;

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

  /** One History drawn: the app's own, or one given when drawn, which the app's Runtime only ever starts from. */
  const makeDraw = (history: History, known?: Snapshot): Draw => {
    const draw: Draw = {
      history,
      first: known && { snapshot: known, replaying: fulfilled(known) },
      drawn: undefined!,
    };
    const now = () =>
      draw === mine
        ? (seeking?.snapshot ?? runtime?.snapshot ?? draw.first?.snapshot)
        : draw.first?.snapshot;
    draw.drawn = makeDrawn(
      now,
      () => draw.first?.snapshot,
      (address, message) => {
        if (draw === mine && seeking === null)
          runtime?.at(address)?.send(message as never, {
            kind: 'view',
            instance: address,
          });
      },
      subscribe,
      () => draw === mine && seeking === null,
    );
    return draw;
  };

  const whose = () => mine;
  const mineOf = () => (mine ??= makeDraw(adopt()));
  /** The app's History as it is now: the one kept beside its Runtime, else the one it draws. */
  const historyNow = () => history ?? mineOf().history;
  const windowNow = () => (keeping === undefined ? keptWindow() : keeping);

  /** The drawing of a History given when drawn, one per saved History, so a draw that suspends finds it again. */
  const given = new WeakMap<SavedHistory, Draw>();
  const givenOf = (saved: SavedHistory) => {
    let draw = given.get(saved);
    if (!draw) given.set(saved, (draw = makeDraw(read(saved))));
    return draw;
  };
  /** Until the app has a History of its own, a given one is drawn as it is. */
  const takesGiven = (saved: SavedHistory | undefined): saved is SavedHistory =>
    saved !== undefined && mounts === 0 && !registry.left(name);

  /** The app's Runtime from now on, followed as it changes. */
  let unfollow = () => {};
  const take = (next: Runtime<A> | null) => {
    unfollow();
    runtime = next;
    unfollow = next
      ? next.subscribe((entries) => {
          // 3. Record
          if (history && entries.length > 0)
            history = History.compact(
              actor,
              History.add(history, entries),
              windowNow(),
            );
          changed();
        })
      : () => {};
    changed();
  };

  const fail = (what: string, error: unknown) => {
    console.error(`[@kestack/kabuki] ${name} could not ${what}:`, error);
    failure = { what, error };
    changed();
  };
  /** Run a Seek, start, stop or Fork, and keep how it went. */
  const control = (what: string, run: () => Promise<void> | undefined) => {
    let running: Promise<void> | undefined;
    try {
      running = run();
    } catch (error) {
      return fail(what, error);
    }
    void Promise.resolve(running).then(
      () => {
        if (failure === null) return;
        failure = null;
        changed();
      },
      (error: unknown) => fail(what, error),
    );
  };

  // 1. Draw
  /**
   * Start replaying a History to its Head, once: what the app draws before
   * its Runtime is made. Its start, or one entry after it, is drawn at
   * once; a longer Branch is replayed without blocking the page.
   */
  const firstDraw = (draw: Draw): FirstDraw => {
    if (draw.first) return draw.first;
    const { history } = draw;
    const first: FirstDraw = { snapshot: undefined, replaying: undefined! };
    first.replaying =
      history.head === null || History.entries(history).length <= 1
        ? fulfilled((first.snapshot = History.snapshot(actor, history)))
        : tracked(
            Effect.runPromise(History.replay(actor, history)).then(
              (snapshot) => {
                first.snapshot = snapshot;
                changed();
                return snapshot;
              },
            ),
          );
    return (draw.first = first);
  };

  /**
   * Wait for the first Snapshot: React shows the fallback until it is
   * replayed. Called on every draw, even once replayed or with the Runtime
   * made, since React wants a draw that suspended on use() to call it
   * again; the thenable is fulfilled by then, so it returns at once.
   */
  const waitForFirstDraw = (draw: Draw) => {
    use(firstDraw(draw).replaying);
  };

  // 2. Mount
  let mounts = 0;
  let close = () => {};
  const mount = (saved: SavedHistory | undefined) => {
    if (takesGiven(saved)) mine = givenOf(saved);
    if (mounts++ === 0) {
      if (!registry.claim(name, app, actor, historyNow)) {
        console.error(
          `[@kestack/kabuki] two apps named ${name} are mounted at once; they cannot share a History`,
        );
        mine = makeDraw(own());
        changed();
      }
      let open = true;
      close = () => {
        open = false;
      };
      const draw = mineOf();
      firstDraw(draw).replaying.then(
        () => {
          if (open) close = run(draw);
        },
        (error: unknown) => {
          console.error(
            `[@kestack/kabuki] ${name} could not be drawn, so its Runtime was not made`,
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

  /** Make the app's Runtime from what it draws, running, and attach what runs beside it; returns how to let both go. */
  const run = (draw: Draw): (() => void) => {
    try {
      keeping = keptWindow();
      history = History.compact(actor, draw.history, keeping);
      // Made stopped and started once it is followed, so no entry is missed.
      const made: Runtime<A> = Runtime.make(actor, {
        snapshot: History.snapshot(actor, history),
        layer,
        running: false,
      } as never);
      take(made);
      void made.start().catch((error: unknown) => fail('start', error));
    } catch (error) {
      history = undefined;
      fail('start', error);
      return () => {};
    }
    const detach = attach();
    return () => {
      detach();
      const last = runtime!;
      // A next mount draws at once where this one left off.
      mine = makeDraw(historyNow(), last.snapshot);
      toHead();
      take(null);
      history = undefined;
      control('stop', () => last.dispose());
    };
  };

  // 4. Seek
  let seeks: Fiber.Fiber<void> | undefined;
  const seek = (entry: number | null) => {
    seeks?.interruptUnsafe();
    seeks = undefined;
    const from = historyNow();
    if (entry !== null && !History.entry(from, entry))
      return fail(
        `seek ${entry}`,
        new RangeError(`[@kestack/kabuki] no History entry ${entry}`),
      );
    // Replayed without blocking the page; drawn once it is.
    seeks = Effect.runFork(
      History.replay(actor, from, entry).pipe(
        Effect.map((snapshot) => {
          seeking = { entry, at: snapshot.at, snapshot };
          if (failure !== null) failure = null;
          changed();
        }),
      ),
    );
  };

  const toHead = () => {
    seeks?.interruptUnsafe();
    seeks = undefined;
    if (seeking === null) return;
    seeking = null;
    changed();
  };

  const fork = (entry: number | null) =>
    control(`fork from ${entry ?? 'the start'}`, () => {
      if (!runtime || !history) return undefined;
      // Throws for an entry the History does not have.
      const moved = History.move(history, entry);
      toHead();
      history = History.compact(actor, moved, windowNow());
      return runtime.follow(History.snapshot(actor, history), {
        restart: true,
      });
    });
  const startOver = () =>
    control('start over', () => {
      if (!runtime || !history) return undefined;
      toHead();
      history = fresh();
      return runtime.follow(History.snapshot(actor, history), {
        restart: true,
      });
    });
  const keep = (next: number | null) => {
    // Throws for a Window that keeps less than nothing.
    const kept = History.compact(actor, historyNow(), next);
    keeping = next;
    remember(next);
    if (history) history = kept;
    changed();
  };
  const start = () => control('start', () => runtime?.start());
  const stop = () => control('stop', () => runtime?.stop());

  /** Each Attachment called with the app; returns how to stop them all. */
  const attach = () => {
    const stops = (options.attach ?? []).flatMap((attachment) => {
      try {
        return [attachment(live as AppRuntime)];
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

  const readNow = () =>
    (seen ??= { runtime, seeking, failure, history: historyNow() });

  /** The app, always read as it is now: what an Attachment holds and `useRuntime` returns. */
  const live: AppRuntime<A> = {
    name,
    get runtime() {
      return runtime;
    },
    get history() {
      return historyNow();
    },
    get window() {
      return windowNow();
    },
    keep,
    get seeking() {
      return seeking;
    },
    get failure() {
      return failure;
    },
    seek,
    toHead,
    fork,
    startOver,
    start,
    stop,
    subscribe,
  };

  const Drawn = ({ draw }: { readonly draw: Draw }) => {
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
      useSyncExternalStore(subscribe, readNow, readNow);
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
   * The first mount in a browser takes it as the app's History and makes
   * the Runtime on it, unless an app of this name has one already, as
   * after a hot reload. Read once: a later one is not drawn.
   */
  readonly saved?: SavedHistory;
  /** Told of every lazy View this drawing draws, so a server can preload their code in the page. */
  readonly onLazyView?: (view: LazyView<AnyActor>) => void;
}

/** One History, drawn: the app's own, or one given when the App is drawn. */
interface Draw {
  readonly history: History;
  first: FirstDraw | undefined;
  drawn: DrawnApp;
}

/** What useRuntime reads, the same object until something changes. */
interface Seen {
  readonly runtime: unknown;
  readonly seeking: unknown;
  readonly failure: Failure | null;
  readonly history: History;
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
