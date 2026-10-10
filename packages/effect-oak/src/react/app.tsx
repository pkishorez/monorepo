// oxlint-disable-next-line no-restricted-imports -- the app's one mount effect: counting mounts starts and stops the Runtime, which lives outside React.
import { useEffect, useSyncExternalStore } from 'react';
import { motionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';
import { Effect, Exit, Layer, Scope } from 'effect';
import { Replay, Runtime } from '../core/index.ts';
import type { AnyNode, Entry, Handle, Needs, Running } from '../core/index.ts';
import type { ViewOf } from './view.tsx';

type Unmet<N, Provided> = [Exclude<Needs<N>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingServices: Exclude<Needs<N>, Provided> }];

const NO_LOG: ReadonlyArray<Entry> = [];

/** The running app, for code outside the tree: a timeline, a devtool. */
export interface AppRuntime {
  /** Every Message with the Instance and Path it went to, its Time, and what came of it. */
  readonly log: ReadonlyArray<Entry>;
  /** The Step the Views show: 0 is right after init, N right after Message N; `null` is live. */
  readonly shown: number | null;
  /** Show the app at a Step, or live again with `null`. */
  readonly show: (step: number | null) => void;
  /** The Time the Views are drawn at. */
  readonly frame: MotionValue<number>;
}

/**
 * The whole app as one React component. Does not compile until the Layer
 * covers every Service the tree still needs.
 *
 * There is one Runtime per `toReact`, however many times the component is
 * mounted: the first mount builds the Layer and starts it, the last unmount
 * stops everything, and every mount draws the same tree.
 *
 * Every View gets `frame`, the Time the app is drawn at. Live, it follows the
 * Runtime's Time at every animation frame; at a Step it stands still at that
 * Message's Time. `App.useRuntime()` reads the Log and chooses the Step shown,
 * from anywhere on the page. Views of the past cannot Send.
 */
export const toReact = <N extends AnyNode, Provided>(
  node: N,
  view: ViewOf<N>,
  layer: Layer.Layer<Provided, never, never>,
  ..._unmet: Unmet<N, Provided>
) => {
  const RootView = view;
  const frame = motionValue(0);

  // The running app, kept outside React so every mount and hook reads the same one.
  let running: Running<N> | undefined;
  let replay: Replay<N> | undefined;
  let shown: number | null = null;
  let tree: Handle<N> | undefined;

  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // The Frame follows the Runtime's Time, one animation frame at a time, only while live.
  let loop: number | undefined;
  const tick = () => {
    if (running) frame.set(running.now());
    loop = requestAnimationFrame(tick);
  };
  const pace = () => {
    const wanted = shown === null && running !== undefined;
    if (wanted && loop === undefined) loop = requestAnimationFrame(tick);
    if (!wanted && loop !== undefined) {
      cancelAnimationFrame(loop);
      loop = undefined;
    }
  };

  const show = (step: number | null) => {
    if (!running) return;
    if (step === null) {
      shown = null;
      tree = running.root;
      frame.set(running.now());
    } else {
      const sent = running.sent();
      shown = Math.min(sent.length, Math.max(0, Math.round(step)));
      replay ??= Replay.make(node, running.sent);
      tree = replay.seek(shown);
      frame.set(shown === 0 ? 0 : sent[shown - 1]!.at);
    }
    pace();
    changed();
  };

  // Mounts share the Runtime: the first starts it, the last stops it.
  let mounts = 0;
  let stop = () => {};
  const mount = () => {
    if (mounts++ === 0) {
      let unsubscribe = () => {};
      const stopHost = host(node, layer, (started) => {
        running = started;
        tree = started.root;
        frame.set(0);
        unsubscribe = started.subscribe(changed);
        pace();
        changed();
      });
      stop = () => {
        stopHost();
        unsubscribe();
        running = replay = tree = undefined;
        shown = null;
        pace();
        changed();
      };
    }
    return () => {
      if (--mounts === 0) stop();
    };
  };

  const App = () => {
    const root = useSyncExternalStore(subscribe, () => tree);
    useEffect(mount, []);
    return root ? <RootView node={root} frame={frame} /> : null;
  };

  return Object.assign(App, {
    displayName: node.name,
    useRuntime: (): AppRuntime => ({
      log: useSyncExternalStore(subscribe, () => running?.log() ?? NO_LOG),
      shown: useSyncExternalStore(subscribe, () => shown),
      show,
      frame,
    }),
  });
};

/**
 * Build the Layer and start the tree under one Scope. Returns a stop function
 * that closes the Scope: every Command and Lifetime ends, then the Layer.
 */
const host = <N extends AnyNode>(
  node: N,
  layer: Layer.Layer<any, never, never>,
  onStarted: (running: Running<N>) => void,
): (() => void) => {
  const scope = Scope.makeUnsafe();
  let stopped = false;
  void Effect.runPromise(
    Layer.build(layer).pipe(
      Effect.flatMap((context) =>
        Runtime.start(node).pipe(Effect.provideContext(context as never)),
      ),
      Scope.provide(scope),
    ),
  ).then((running) => {
    if (!stopped) onStarted(running);
  });
  return () => {
    stopped = true;
    void Effect.runPromise(Scope.close(scope, Exit.void));
  };
};
