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
} from '../core/index.ts';
import type { ViewOf } from './view.tsx';

type Unmet<N, Provided> = [Exclude<Needs<N>, Provided>] extends [never]
  ? []
  : [unmet: { readonly missingServices: Exclude<Needs<N>, Provided> }];

const NO_LOG: ReadonlyArray<Entry> = [];
const NONE: ReadonlyArray<Sent> = [];

/** Where the app's Views are: live, or replayed after some of its Messages. */
export interface TimeTravel {
  /** Every Message and the Instance it was sent to, in order. */
  readonly messages: ReadonlyArray<Sent>;
  /** How many Messages the Views show; 0 is right after init, `null` is live. */
  readonly at: number | null;
  /** Show the app as it was after `at` Messages, or live again with `null`. */
  readonly travel: (at: number | null) => void;
}

/**
 * The whole app as one React component: builds the Layer, starts the tree when
 * mounted, and stops everything when unmounted. Does not compile until the
 * Layer covers every Service the tree still needs.
 *
 * `App.useLog()` reads the mounted app's Log from anywhere on the page:
 * every Message with what came of it and when. `App.useTimeTravel()` has only
 * the Messages, and moves the Views to any point of them. The app keeps
 * running while its Views show the past; Views of the past cannot send.
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
  let shown: Handle<N> | undefined;

  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const travel = (to: number | null) => {
    if (!running) return;
    at = to === null ? null : Math.max(0, to);
    if (at === null) {
      shown = running.root;
    } else {
      replay ??= Replay.make(node, running.sent);
      shown = replay.seek(at);
    }
    changed();
  };

  const App = () => {
    const root = useSyncExternalStore(subscribe, () => shown);
    useEffect(() => {
      let unsubscribe = () => {};
      const stop = host(node, layer, (started) => {
        running = started;
        shown = started.root;
        unsubscribe = started.subscribe(changed);
        changed();
      });
      return () => {
        stop();
        unsubscribe();
        running = replay = shown = undefined;
        at = null;
        changed();
      };
    }, []);
    return root ? <RootView node={root} /> : null;
  };

  return Object.assign(App, {
    displayName: node.name,
    useLog: (): ReadonlyArray<Entry> =>
      useSyncExternalStore(subscribe, () => running?.log() ?? NO_LOG),
    useTimeTravel: (): TimeTravel => ({
      messages: useSyncExternalStore(subscribe, () => running?.sent() ?? NONE),
      at: useSyncExternalStore(subscribe, () => at),
      travel,
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
