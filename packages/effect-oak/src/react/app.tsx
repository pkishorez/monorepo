import { useEffect, useSyncExternalStore } from 'react';
import { Effect, Exit, Layer, Scope } from 'effect';
import { Replay, Runtime } from '../core/index.ts';
import type {
  AnyNode,
  Entry,
  Handle,
  Needs,
  Running,
  Sent,
  Snapshot,
} from '../core/index.ts';
import { FramesContext } from './frames.ts';
import type { Frames } from './frames.ts';
import type { ViewOf } from './view.tsx';

type Unmet<N, Provided> = [Exclude<Needs<N>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingServices: Exclude<Needs<N>, Provided> }];

const NO_LOG: ReadonlyArray<Entry> = [];
const NONE: ReadonlyArray<Sent> = [];

/** Where the app's Views are: live, or replayed at some Time. */
export interface TimeTravel {
  /** Every Message, the Instance it was sent to and its Time, in order. */
  readonly messages: ReadonlyArray<Sent>;
  /** The Time the Views show, in milliseconds since the app started; `null` is live. */
  readonly at: number | null;
  /** Whether the app's Time is stopped. */
  readonly paused: boolean;
  /** The live Time now; it stands still while paused. */
  readonly now: () => number;
  /** Show the app as it was at Time `at`, or live again with `null`. */
  readonly travel: (at: number | null) => void;
  /** Stop the app's Time and show it as it is now, ready to travel. */
  readonly pause: () => void;
  /** Start the app's Time again from where it stopped, and show it live. */
  readonly resume: () => void;
}

/**
 * The whole app as one React component: builds the Layer, starts the tree when
 * mounted, and stops everything when unmounted. Does not compile until the
 * Layer covers every Service the tree still needs.
 *
 * `App.useRoot()` reads the live root's Model and State from anywhere on the
 * page, whatever the Views show. `App.useLog()` reads the mounted app's Log:
 * every Message with what came of it and when. `App.useTimeTravel()` has only
 * the Messages, and moves the Views to any Time. Pausing stops the app's Time
 * so the past can be looked at without the app moving on; Views of the past
 * cannot send.
 *
 * Views that draw Frames get one per animation frame while live, and one per
 * move of the timeline while in the past. No animation frame is requested
 * while no View draws Frames.
 */
export const toReact = <N extends AnyNode, Provided>(
  node: N,
  view: ViewOf<N>,
  layer: Layer.Layer<Provided, never, never>,
  ..._unmet: Unmet<N, Provided>
) => {
  const RootView = view;

  // The mounted app, kept outside React so the hooks can read it from anywhere.
  let running: Running<N> | undefined;
  let replay: Replay<N> | undefined;
  let at: number | null = null;
  let paused = false;
  let shown: Handle<N> | undefined;

  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // Frames: one animation-frame loop for every View that draws them.
  const drawers = new Set<(at: number) => void>();
  let loop: number | undefined;
  const frameAt = () => at ?? running?.now() ?? 0;
  const drawAll = () => {
    const time = frameAt();
    for (const draw of drawers) draw(time);
  };
  const tick = () => {
    drawAll();
    loop = requestAnimationFrame(tick);
  };
  /** Loop only while live, started, and someone draws Frames. */
  const pace = () => {
    const wanted = at === null && running !== undefined && drawers.size > 0;
    if (wanted && loop === undefined) loop = requestAnimationFrame(tick);
    if (!wanted && loop !== undefined) {
      cancelAnimationFrame(loop);
      loop = undefined;
    }
  };
  const frames: Frames = {
    now: frameAt,
    subscribe: (draw) => {
      drawers.add(draw);
      pace();
      return () => {
        drawers.delete(draw);
        pace();
      };
    },
  };

  const now = () => running?.now() ?? 0;

  const travel = (to: number | null) => {
    if (!running) return;
    at = to === null ? null : Math.min(running.now(), Math.max(0, to));
    if (at === null) {
      shown = running.root;
    } else {
      replay ??= Replay.make(node, running.sent);
      shown = replay.seek(at);
      drawAll();
    }
    pace();
    changed();
  };

  const pause = () => {
    if (!running || paused) return;
    running.pause();
    paused = true;
    travel(running.now());
  };

  const resume = () => {
    if (!running || !paused) return;
    running.resume();
    paused = false;
    travel(null);
  };

  const App = () => {
    const root = useSyncExternalStore(subscribe, () => shown);
    useEffect(() => {
      let unsubscribe = () => {};
      const stop = host(node, layer, (started) => {
        running = started;
        shown = started.root;
        unsubscribe = started.subscribe(changed);
        pace();
        changed();
      });
      return () => {
        stop();
        unsubscribe();
        running = replay = shown = undefined;
        at = null;
        paused = false;
        pace();
        changed();
      };
    }, []);
    return root ? (
      <FramesContext value={frames}>
        <RootView node={root} />
      </FramesContext>
    ) : null;
  };

  return Object.assign(App, {
    displayName: node.name,
    useRoot: (): Snapshot<N> | undefined =>
      useSyncExternalStore(subscribe, () => running?.root.current()),
    useLog: (): ReadonlyArray<Entry> =>
      useSyncExternalStore(subscribe, () => running?.log() ?? NO_LOG),
    useTimeTravel: (): TimeTravel => ({
      messages: useSyncExternalStore(subscribe, () => running?.sent() ?? NONE),
      at: useSyncExternalStore(subscribe, () => at),
      paused: useSyncExternalStore(subscribe, () => paused),
      now,
      travel,
      pause,
      resume,
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
