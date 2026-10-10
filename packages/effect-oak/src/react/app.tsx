// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts starts and stops the Runtime, which lives outside React.
import { useEffect, useSyncExternalStore } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { Effect, Exit, Fiber, Layer, Scope } from 'effect';
import { Runtime } from '../core/index.ts';
import type {
  AnyActor,
  Entry,
  Needs,
  Running,
  RuntimeState,
} from '../core/index.ts';
import { makeDrawn } from './drawn.ts';
import { DrawnContext, FrameContext } from './view.tsx';
import type { ViewOf } from './view.tsx';

type Unmet<A, Provided> = [Exclude<Needs<A>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingCapabilities: Exclude<Needs<A>, Provided> }];

const EMPTY: RuntimeState = {
  entries: [],
  head: null,
  running: false,
  shown: null,
};
const NO_ENTRIES: ReadonlyArray<Entry> = [];

/** The running app, for code outside the tree: a timeline, a devtool. */
export interface AppRuntime {
  /** The current Branch: every entry from the first to the Head, each with its id. */
  readonly log: ReadonlyArray<Entry>;
  /** The entry the next Message goes after, or `null` right after init. */
  readonly head: number | null;
  /** Whether the Runtime is running. */
  readonly running: boolean;
  /** The entry the Views show, or `null` for live. */
  readonly shown: number | null;
  /** Show the app right after an entry, on any Branch, or live again with `null`. */
  readonly show: (entry: number | null) => void;
  /** Close every Command, Lifetime and Capability. The Snapshot and the Log stay, and the Frame stands still. */
  readonly stop: () => void;
  /**
   * Start from an entry (`null`: right after init), growing a new Branch from
   * it; with no entry, resume from the Head.
   */
  readonly start: (from?: number | null) => void;
  /** The entries that follow an entry (`null`: right after init), to draw the tree. */
  readonly children: (entry: number | null) => ReadonlyArray<Entry>;
  /** The Time the Views are drawn at. */
  readonly frame: MotionValue<number>;
}

/**
 * The whole app as one React component. Does not compile until the Layer
 * covers every Capability the tree still needs.
 *
 * There is one Runtime per `toReact`, however many times the component is
 * mounted, and every mount draws the same tree. The first mount builds the
 * Layer and starts it; the last unmount stops it and closes the Layer. A
 * Runtime stopped by hand stays stopped while mounts come and go; when the
 * count drops to zero and rises again, it starts from the Head.
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
  ..._unmet: Unmet<A, Provided>
) => {
  const RootView = view;
  const frame = motionValue(0);
  const root = { id: actor.name };

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

  // The Frame follows the Runtime's Time, one animation frame at a time, only while live and running.
  let loop: number | undefined;
  const tick = () => {
    if (runtime) frame.set(runtime.now());
    loop = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (!runtime) return;
    const { shown, running, entries } = runtime.state();
    frame.set(shown === null ? runtime.now() : entries[shown]!.at);
    const wanted = shown === null && running;
    if (wanted && loop === undefined) loop = requestAnimationFrame(tick);
    if (!wanted && loop !== undefined) {
      cancelAnimationFrame(loop);
      loop = undefined;
    }
  };

  const drawn = makeDrawn(() => runtime, subscribe);

  // Mounts share the Runtime: the first starts it, the last stops it.
  let mounts = 0;
  let close = () => {};
  let unsubscribe = () => {};
  const mount = () => {
    if (mounts++ === 0) {
      close = host(actor, layer, runtime?.state(), (started) => {
        unsubscribe();
        runtime = started;
        unsubscribe = started.subscribe(changed);
        changed();
      });
    }
    return () => {
      if (--mounts === 0) close();
    };
  };

  const read = () => runtime?.state() ?? EMPTY;
  const control = (effect: Effect.Effect<void> | undefined) => {
    if (effect) Effect.runFork(effect);
  };
  const show = (entry: number | null) => control(runtime?.show(entry));
  const stop = () => control(runtime?.stop());
  const start = (from?: number | null) => control(runtime?.start(from));
  const children = (entry: number | null) =>
    runtime?.children(entry) ?? NO_ENTRIES;

  const App = () => {
    const ready = useSyncExternalStore(subscribe, () => runtime !== undefined);
    useEffect(mount, []);
    return ready ? (
      <DrawnContext value={drawn}>
        <FrameContext value={frame}>
          <RootView node={root} />
        </FrameContext>
      </DrawnContext>
    ) : null;
  };

  return Object.assign(App, {
    displayName: actor.name,
    useRuntime: (): AppRuntime => {
      const { head, running, shown } = useSyncExternalStore(subscribe, read);
      return {
        log: runtime?.log() ?? NO_ENTRIES,
        head,
        running,
        shown,
        show,
        stop,
        start,
        children,
        frame,
      };
    },
  });
};

/**
 * Build the Layer and start the tree under one Scope, carrying on from a saved
 * Log if there is one. Returns a function that closes the Scope: every Command
 * and Lifetime ends, then the Layer.
 */
const host = <A extends AnyActor>(
  actor: A,
  layer: Layer.Layer<any, never, never>,
  saved: RuntimeState | undefined,
  onStarted: (running: Running<A>) => void,
): (() => void) => {
  const scope = Scope.makeUnsafe();
  const starting = Effect.runFork(
    Layer.build(layer).pipe(
      Effect.flatMap((context) =>
        Runtime.start(actor, saved ? { saved } : {}).pipe(
          Effect.provideContext(context as never),
        ),
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
