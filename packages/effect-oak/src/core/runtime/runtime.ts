import { Clock, Context, Effect } from 'effect';
import type { Scope } from 'effect';
import type { AnyNode, Tagged, Types } from '../node/index.ts';
import { destroy, handle, live, plant } from '../tree/index.ts';
import type { Handle, Instance } from '../tree/index.ts';
import { Log } from '../log/index.ts';
import type { Entry, RuntimeState } from '../log/index.ts';
import { Replay, rebuild } from '../replay/index.ts';
import { liveHooks } from './live-hooks.ts';
import { makeQueue } from './queue.ts';
import { makeTime } from './time.ts';

/*
 * The live app: the tree, its Log, and everything that touches the outside
 * world.
 *
 * 1. Start      the root is created with the Services of the app's Layer, and
 *               Time starts at 0 on Effect's monotonic Clock, which Commands
 *               and Lifetimes use too. Given a saved Log, the Runtime starts
 *               from its Head instead.
 * 2. Messages   are stamped with their Time when sent, wait in a queue and are
 *               handled one at a time. Each one is appended to the Log after
 *               the Head.
 * 3. Stop       interrupts every Lifetime and Command. The tree and the Log
 *               stay, Time stands still, and nothing can Send.
 * 4. Start      from any entry Replays the Branch to it, makes that tree live,
 *               and moves the Head there: new Messages grow a new Branch.
 * 5. Show       the app right after any entry, on any Branch, or live.
 */

/** Services a Node's tree still needs from the app's Layer. */
export type Needs<N> = Types<N>['open'];

/** A running app: its tree, its Log, and the controls to stop, start and show. */
export interface Running<N> {
  /** The live root. */
  readonly root: () => Handle<N>;
  /** What to draw: the live root, or the Replay right after the entry shown. */
  readonly drawn: () => Handle<N>;
  /** The Time now, in milliseconds. It stands still while stopped. */
  readonly now: () => number;
  /** The whole Log, as one value. */
  readonly state: () => RuntimeState;
  /** Called on every change to the Log. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The current Branch: every entry from the first to the Head. */
  readonly log: () => ReadonlyArray<Entry>;
  /** The entries that follow an entry; `null` for right after init. */
  readonly children: (of: number | null) => ReadonlyArray<Entry>;
  /** Show the app right after an entry, on any Branch, or live with `null`. */
  readonly show: (entry: number | null) => void;
  /** Interrupt every Lifetime and Command. The tree and the Log stay. */
  readonly stop: () => void;
  /**
   * Start from an entry (`null`: right after init), growing a new Branch from
   * it; with no entry, resume from the Head. Stops first if running.
   */
  readonly start: (from?: number | null) => void;
}

// 1. Start ---------------------------------------------------------------------

/**
 * Start a Node as the root of a running app. Needs every Service the tree
 * still requires; closing the Scope stops every Command and Lifetime for good.
 * Given a saved Log, it carries on from its Head without running init's
 * Commands.
 */
const start = <N extends AnyNode>(
  node: N,
  saved?: RuntimeState,
): Effect.Effect<Running<N>, never, Needs<N> | Scope.Scope> =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const time = makeTime(() => clock.monotonicTimeNanosUnsafe());
    // Commands and Lifetimes run on the Clock the Runtime was started with.
    const services = Context.add(
      (yield* Effect.context<Needs<N>>()) as Context.Context<never>,
      Clock.Clock,
      clock,
    ) as Context.Context<never>;

    const log = Log.make(saved);
    const queue = makeQueue(time.now, () => log.get().running, record(log));
    const replay = Replay.make(node);
    let hooks = liveHooks(services, queue.send);
    let root: Instance;
    let drawn: Instance;
    let closed = false;

    /** Hand a tree to fresh live Hooks, and carry on from Time `at`. */
    const goLive = (tree: Instance, at: number, head: number | null) => {
      hooks = liveHooks(services, queue.send);
      root = drawn = tree;
      time.start(at);
      log.set({ head, running: true, shown: null });
      queue.hold(() => live(tree, hooks));
    };

    // 3. Stop
    const stop = () => {
      if (!log.get().running) return;
      time.stop();
      hooks.halt(root);
      log.set({ running: false });
    };

    // 4. Start
    const startFrom = (from?: number | null) => {
      if (closed) return;
      const { entries, head } = log.get();
      const target = from === undefined ? head : from;
      if (target !== null && !entries[target])
        throw new RangeError(`[effect-oak] no Log entry ${target}`);
      stop();
      // A resume carries on from the Time it stopped at; a fork from its entry's.
      const at =
        from === undefined
          ? time.now()
          : target === null
            ? 0
            : entries[target]!.at;
      destroy(root);
      goLive(rebuild(node, log.branch(target)), at, target);
    };

    // 5. Show
    const show = (entry: number | null) => {
      drawn = entry === null ? root : (replay.seek(log.branch(entry)) as never);
      log.set({ shown: entry });
    };

    if (saved) {
      const { head, entries } = log.get();
      root = rebuild(node, log.branch(head));
      goLive(root, head === null ? 0 : entries[head]!.at, head);
    } else {
      time.start(0);
      log.set({ running: true });
      root = drawn = queue.hold(() => plant(node, hooks));
    }
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        stop();
        closed = true;
        destroy(root);
      }),
    );

    return {
      root: () => root as unknown as Handle<N>,
      drawn: () => drawn as unknown as Handle<N>,
      now: time.now,
      state: log.get,
      subscribe: log.subscribe,
      log: () => log.branch(log.get().head),
      children: log.children,
      show,
      stop,
      start: startFrom,
    };
  });

/** The running app: the tree of Instances, the Log, and the work in flight. */
export const Runtime = { start };

// 2. Messages ------------------------------------------------------------------

/** Handle a Message, and append what came of it to the Log. */
const record =
  (log: Log) => (instance: Instance, message: Tagged, at: number) => {
    log.append({
      instance: instance.id,
      path: instance.path,
      message,
      at,
      ...handle(instance, message, at),
    });
  };
