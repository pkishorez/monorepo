// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts starts and stops the Runtime, which lives outside React.
import { Suspense, use, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { Effect, Exit, Fiber, Scope } from 'effect';
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
import { AppContext, FrameContext } from './view.tsx';
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
 *           app with this name, after a hot reload too.
 * 3. Show   any Step: the Views draw the Snapshot right after it, at its
 *           Time, while the live app runs on underneath. A Send from the
 *           past is dropped.
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
  /** The Time the Views are drawn at. */
  readonly frame: MotionValue<number>;
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
  const frame = motionValue(0);
  const app = {};

  const own = () =>
    options.saved ? History.load(actor, options.saved) : History.make(actor);
  /** The History an app of this name holds or left, read with this code, else its own. */
  const adopt = () => {
    const left = registry.history(name);
    return left ? History.load(actor, left.save()) : own();
  };

  let history: History<A> | undefined;
  let first: FirstDraw | undefined;
  let runtime: Running<A> | undefined;
  let shown: Step | null = null;
  let past: Snapshot | undefined;

  const listeners = new Set<() => void>();
  let seen: Seen | undefined;
  const changed = () => {
    seen = undefined;
    moveFrame();
    for (const listener of listeners) listener();
  };

  let unwatch = () => {};
  const take = (next: History<A>) => {
    unwatch();
    history = next;
    first = undefined;
    unwatch = next.subscribe(changed);
    return next;
  };
  const historyOf = () => history ?? take(adopt());

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

  const timeOf = (step: Step | null) =>
    step === null || step === 'init' ? 0 : historyOf().save().entries[step]!.at;

  // The Frame follows the Runtime's Time, one animation frame at a time, only while live and running.
  let loop: number | undefined;
  const tick = () => {
    if (runtime) frame.set(runtime.now());
    loop = requestAnimationFrame(tick);
  };
  const moveFrame = () => {
    const live = shown === null;
    frame.set(
      live ? (runtime?.now() ?? timeOf(historyOf().head())) : timeOf(shown),
    );
    const wanted = live && (runtime?.running() ?? false);
    if (wanted && loop === undefined) loop = requestAnimationFrame(tick);
    if (!wanted && loop !== undefined) {
      cancelAnimationFrame(loop);
      loop = undefined;
    }
  };

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
          `[effect-oak] two apps named ${name} are mounted at once; they cannot share a History`,
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
          close = host(historyOf(), layer, (started) => {
            unsubscribe();
            runtime = started;
            unsubscribe = started.subscribe(changed);
            changed();
          });
        },
        (error: unknown) => {
          console.error(
            `[effect-oak] ${name} could not be drawn, so its Runtime did not start`,
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

  const control = (effect: Effect.Effect<void> | undefined) => {
    if (effect) Effect.runFork(effect);
  };
  const start = (from?: number | null) => control(runtime?.start(from));
  const stop = () => control(runtime?.stop());
  const clear = () =>
    control(
      Effect.gen(function* () {
        yield* runtime?.stop() ?? Effect.void;
        historyOf().clear();
        yield* runtime?.start() ?? Effect.void;
      }),
    );

  const read = () =>
    (seen ??= {
      saved: historyOf().save(),
      running: runtime?.running() ?? false,
      shown,
    });

  const Drawn = () => {
    if (!runtime) waitForFirstDraw();
    return (
      <AppContext value={drawn}>
        <FrameContext value={frame}>
          <RootView instance={root} />
        </FrameContext>
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
      const { saved, running, shown } = useSyncExternalStore(
        drawn.subscribe,
        read,
        read,
      );
      return {
        history: historyOf(),
        branch: historyOf().branch(saved.head),
        head: saved.head,
        running,
        shown,
        show,
        start,
        stop,
        clear,
        workers: (instance) => runtime?.workers(instance) ?? NO_WORKERS,
        frame,
      };
    },
  });
};

/** What useRuntime reads, the same object until something changes. */
interface Seen {
  readonly saved: SavedHistory;
  readonly running: boolean;
  readonly shown: Step | null;
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
 * Start the Runtime under one Scope. Returns a function that closes the
 * Scope: every Command and Worker ends, then the Layer.
 */
const host = <A extends AnyActor>(
  history: History<A>,
  layer: Layer.Layer<any, never, never>,
  onStarted: (running: Running<A>) => void,
): (() => void) => {
  const scope = Scope.makeUnsafe();
  const starting = Effect.runFork(
    Runtime.start(history, ...([layer] as never)).pipe(Scope.provide(scope)),
  );
  starting.addObserver((exit) => {
    if (Exit.isSuccess(exit)) onStarted(exit.value);
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
