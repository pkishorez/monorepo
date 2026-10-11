// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts starts and stops the Runtime, which lives outside React.
import { Suspense, use, useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { Effect, Exit, Fiber, Layer, Scope } from 'effect';
import { Log, Replay, Runtime, init, outcomeOf } from '../core/index.ts';
import type {
  AnyActor,
  Definition,
  Entry,
  Needs,
  Running,
  RuntimeState,
  Snapshot,
  WorkerStatus,
} from '../core/index.ts';
import { makeDrawn } from './drawn.ts';
import { registry } from './registry.ts';
import { DrawnContext, FrameContext } from './view.tsx';
import type { ViewOf } from './view.tsx';

type Unmet<A, Provided> = [Exclude<Needs<A>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingCapabilities: Exclude<Needs<A>, Provided> }];

const NO_WORKERS: ReadonlyArray<WorkerStatus> = [];

/** How the app starts. */
export interface AppOptions {
  /**
   * What the app is called: the Log its last mount leaves is picked up by
   * the next mount of an app with this name, after a hot reload too. By
   * default the root Actor's name; give one when two apps share a root
   * Actor's name and must not share a Log.
   */
  readonly name?: string;
  /**
   * A Log saved before. The app is first drawn from it, on a server or at
   * build time too, and its Runtime carries on from it: live at its Head,
   * stopped, or showing the entry it showed. A Log of one Restore, from
   * `Replay.restored`, is the lightest form.
   */
  readonly saved?: RuntimeState;
}

/** The running app, for code outside the tree: a timeline, a devtool. */
export interface AppRuntime {
  /** The current Branch: every entry from the first to the Head, each with its id. */
  readonly log: ReadonlyArray<Entry>;
  /** The entry the next Message goes after, or `null` right after init. */
  readonly head: number | null;
  /** Whether the Runtime is running. */
  readonly running: boolean;
  /** The entry the Views show, `'init'` for right after init, or `null` for live. */
  readonly shown: number | 'init' | null;
  /** Show the app right after init or an entry, on any Branch, or live again with `null`. */
  readonly show: (entry: number | 'init' | null) => void;
  /** Close every Command, Worker and Capability. The Snapshot and the Log stay, and the Frame stands still. */
  readonly stop: () => void;
  /**
   * Start from an entry (`null`: right after init), growing a new Branch from
   * it; with no entry, resume from the Head.
   */
  readonly start: (from?: number | null) => void;
  /** Forget the whole Log, every Branch, and go live from init. */
  readonly clear: () => void;
  /** The entries that follow an entry (`null`: right after init), to draw the tree. */
  readonly children: (entry: number | null) => ReadonlyArray<Entry>;
  /** The Snapshot right after an entry, on any Branch (`null`: right after init), to take the app apart. */
  readonly snapshotAt: (entry: number | null) => Snapshot | undefined;
  /**
   * What came of an entry: handled, ignored, or dropped because its Instance
   * was gone. Worked out, never kept in the Log.
   */
  readonly outcome: (entry: number) => 'handled' | 'ignored' | 'dropped';
  /** The root Actor's definition: every State, Child and Worker the app can have. */
  readonly definition: Definition;
  /** What an Instance's Workers are doing now: live only, never in the Snapshot. Empty while stopped. */
  readonly workers: (instance: string) => ReadonlyArray<WorkerStatus>;
  /** The Time the Views are drawn at. */
  readonly frame: MotionValue<number>;
}

/**
 * The whole app as one React component. Does not compile until the Layer
 * covers every Capability the tree still needs.
 *
 * The app is drawn before it runs. Its first draw is the Step its Log shows:
 * init with no Log, else the saved Log's Head or the entry it was showing,
 * Replayed through Suspense, so a server or a build can draw it and a long
 * Log never freezes the page. Until the Runtime starts, Views cannot Send.
 *
 * There is one Runtime per `toReact`, however many times the component is
 * mounted, and every mount draws the same tree. The first mount in a browser
 * builds the Layer and starts the Runtime from the Log the app was drawn
 * from; the last unmount stops it, closes the Layer, and leaves the Log for
 * the next mount of an app with the root Actor's name: the same one, or a new
 * one from a hot reload, whose code Replays it. A Runtime stopped by hand
 * stays stopped while mounts come and go.
 *
 * Every View's draw gets `frame`, the Time the app is drawn at, from context.
 * Live and running, it follows the Runtime's Time at every animation frame;
 * stopped, it stands still; showing an entry, it stands at that entry's Time.
 * `App.useRuntime()` reads the Log, shows any entry, and stops and starts the
 * Runtime, from anywhere on the page. Views of the past or of a stopped app
 * cannot Send.
 */
export const toReact = <A extends AnyActor, Provided>(
  actor: A,
  view: ViewOf<A>,
  layer: Layer.Layer<Provided, never, never>,
  options: AppOptions = {},
  ..._unmet: Unmet<A, Provided>
) => {
  const RootView = view;
  const definition = actor.definition;
  const name = options.name ?? definition.name;
  const frame = motionValue(0);
  const root = { id: definition.name };
  const self = {};

  // The latest Runtime, kept outside React so every mount and hook reads the
  // same one. It stays readable after the last unmount closes it.
  let runtime: Running<A> | undefined;

  const listeners = new Set<() => void>();
  const changed = () => {
    sync();
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // What the app is drawn from before any Runtime: the Log a mounted or
  // hot-reloaded app of this name holds, else the one given, Replayed to the
  // Step it shows. Made once, on first use.
  let seed: Seed | undefined;
  const seedOf = (): Seed => {
    if (seed) return seed;
    const log = Log.make(registry.saved(name) ?? options.saved);
    const replay = Replay.make(definition, undefined);
    const first = init(definition);
    replay.save(null, first);
    const played = new Map<number | null, Snapshot>([[null, first]]);
    const { entries, head, shown } = log.get();
    const target = shown === 'init' ? null : shown === null ? head : shown;
    const at = target === null ? 0 : entries[target]!.at;
    const made: Seed = {
      log,
      replay,
      played,
      snapshot: undefined,
      drawn: undefined!,
    };
    seed = made;
    if (target === null) {
      made.snapshot = first;
      frame.set(0);
      made.drawn = fulfilled(first);
    } else {
      made.drawn = tracked(
        Effect.runPromise(replay.seek(log.branch(target))).then((snapshot) => {
          made.snapshot = snapshot;
          frame.set(at);
          changed();
          return snapshot;
        }),
      );
    }
    return made;
  };

  /** The Snapshot right after an entry, before the Runtime: played from the nearest one played and remembered. */
  const playedAt = ({ log, played }: Seed, entry: number | null) => {
    const { entries } = log.get();
    const path: Array<Entry> = [];
    let from = entry;
    while (!played.has(from)) {
      const next = entries[from!]!;
      path.push(next);
      from = next.parent;
    }
    let snapshot = played.get(from)!;
    for (const next of path.reverse()) {
      snapshot = Replay.fold(definition, [next], snapshot);
      played.set(next.id, snapshot);
    }
    return snapshot;
  };

  // The Frame follows the Runtime's Time, one animation frame at a time, only while live and running.
  let loop: number | undefined;
  const tick = () => {
    if (runtime) frame.set(runtime.now());
    loop = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (!runtime) return;
    const { shown, running, entries } = runtime.state();
    frame.set(
      shown === null
        ? runtime.now()
        : shown === 'init'
          ? 0
          : entries[shown]!.at,
    );
    const wanted = shown === null && running;
    if (wanted && loop === undefined) loop = requestAnimationFrame(tick);
    if (!wanted && loop !== undefined) {
      cancelAnimationFrame(loop);
      loop = undefined;
    }
  };

  const drawn = makeDrawn(
    () => runtime?.drawn() ?? seed?.snapshot,
    () => seed?.snapshot,
    (id, message) => {
      if (runtime && runtime.state().shown === null)
        runtime.send(id, message, { kind: 'view', instance: id });
    },
    subscribe,
  );

  // Mounts share the Runtime: the first starts it, the last stops it and
  // keeps its Log as it was, for the next first mount.
  let mounts = 0;
  let left: RuntimeState | undefined;
  let close = () => {};
  let unsubscribe = () => {};
  const read = () => runtime?.state() ?? seedOf().log.get();
  const mount = () => {
    if (mounts++ === 0) {
      const owned = registry.claim(name, self, () => runtime?.state());
      if (!owned)
        console.error(
          `[effect-oak] two apps named ${name} are mounted at once; they cannot share a Log`,
        );
      const saved = runtime
        ? left
        : ((owned ? registry.saved(name) : undefined) ?? options.saved);
      let open = true;
      close = () => {
        open = false;
      };
      void Promise.resolve(seedOf().drawn).then(
        (drawnFrom) => {
          if (!open) return;
          close = host(
            actor,
            layer,
            saved,
            runtime ? undefined : seedOf().replay,
            (started) => {
              unsubscribe();
              runtime = started;
              unsubscribe = started.subscribe(changed);
              changed();
            },
          );
          return drawnFrom;
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
        left = runtime?.state();
        registry.release(name, self, left);
        close();
      }
    };
  };

  const control = (effect: Effect.Effect<void> | undefined) => {
    if (effect) Effect.runFork(effect);
  };
  const show = (entry: number | 'init' | null) => control(runtime?.show(entry));
  const stop = () => control(runtime?.stop());
  const start = (from?: number | null) => control(runtime?.start(from));
  const clear = () => control(runtime?.clear());
  const children = (entry: number | null) =>
    runtime?.children(entry) ?? seedOf().log.children(entry);
  const snapshotAt = (entry: number | null) =>
    runtime?.snapshotAt(entry) ?? playedAt(seedOf(), entry);
  const outcome = (entry: number) => {
    if (runtime) return runtime.outcome(entry);
    const seed = seedOf();
    const envelope = seed.log.get().entries[entry]!;
    return outcomeOf(definition, playedAt(seed, envelope.parent), envelope);
  };

  const Drawn = () => {
    if (!runtime) {
      const { snapshot, drawn: pending } = seedOf();
      if (!snapshot) use(pending);
    }
    return (
      <DrawnContext value={drawn}>
        <FrameContext value={frame}>
          <RootView instance={root} />
        </FrameContext>
      </DrawnContext>
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
    useRuntime: (): AppRuntime => {
      const { head, running, shown } = useSyncExternalStore(
        subscribe,
        read,
        read,
      );
      return {
        log: runtime?.log() ?? seedOf().log.branch(head),
        head,
        running,
        shown,
        show,
        stop,
        start,
        clear,
        children,
        snapshotAt,
        outcome,
        definition,
        workers: (instance) => runtime?.workers(instance) ?? NO_WORKERS,
        frame,
      };
    },
  });
};

/** What the app is drawn from before any Runtime. */
interface Seed {
  readonly log: Log;
  readonly replay: Replay;
  /** The Snapshot right after each entry played so far, and init. */
  readonly played: Map<number | null, Snapshot>;
  /** The Snapshot drawn, once Replayed. */
  snapshot: Snapshot | undefined;
  drawn: Thenable<Snapshot>;
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
 * Build the Layer and start the tree under one Scope, carrying on from a saved
 * Log if there is one. Returns a function that closes the Scope: every Command
 * and Worker ends, then the Layer.
 */
const host = <A extends AnyActor>(
  actor: A,
  layer: Layer.Layer<any, never, never>,
  saved: RuntimeState | undefined,
  replay: Replay | undefined,
  onStarted: (running: Running<A>) => void,
): (() => void) => {
  const scope = Scope.makeUnsafe();
  const starting = Effect.runFork(
    Layer.build(layer).pipe(
      Effect.flatMap((context) =>
        Runtime.start(actor, {
          ...(saved ? { saved } : {}),
          ...(replay ? { replay } : {}),
        }).pipe(Effect.provideContext(context as never)),
      ),
      Scope.provide(scope),
    ),
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
