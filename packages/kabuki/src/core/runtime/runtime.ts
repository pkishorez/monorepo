import {
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Queue,
  Scope,
  Stream,
} from 'effect';
import type { AnyActor, Tagged, Types } from '../actor/index.ts';
import { History, Snapshot } from '../data/index.ts';
import type { Address, From } from '../data/index.ts';
import { actorAt, isRestore, remember } from '../data/play/index.ts';
import {
  LiveTree,
  Stopped,
  forkIn,
  makeMailbox,
  makeTime,
} from './live/index.ts';
import type {
  Host,
  Letter,
  Sent,
  Services,
  WorkerStatus,
} from './live/index.ts';
import { reach } from './outside.ts';
import type { LiveInstance } from './outside.ts';

/*
 * The Runtime: what an app runs as, one per app. A History, the Snapshot at
 * its Head, and whether it runs. It runs from the moment it is made.
 *
 * 1. Make   on a History, a new one by default: replay to its Head, carry
 *           Time on from the Head's Time, and run.
 * 2. Send   a Message, stamped with its Time, into the one Mailbox. Each
 *           one becomes a History entry after the Head and is played at
 *           once; the History keeps to its Window after each. What its
 *           Update Emits is Sent next. Only while it runs: stopped, a Send
 *           is refused and adds nothing.
 * 3. Run    start the tree from the Snapshot at the Head, hosted by the
 *           Mailbox, the Time and the app's Layer, built once. After every
 *           Message the tree follows the Snapshot, starting the Workers and
 *           Provides it asks for and stopping the rest, and the Commands
 *           the Update asked for run. No Command runs twice: starting again
 *           starts only the work the Head's data asks for.
 * 4. Stop   the tree: every Worker, Provide and Command ends, and Time
 *           stands still until it runs again.
 * 5. Fork   move the Head to any entry, or to init, in place, and Time to
 *           that entry's: running, the work stops and starts again from
 *           that entry's data; stopped, only the Head moves. The next
 *           Message grows a new Branch.
 * 6. Seek   any entry, on any Branch, as a Step: plain data, a look that
 *           changes nothing.
 * 7. Let go stop, close the Mailbox and the Layer.
 */

/** Capabilities an Actor's tree still needs from the app's Layer. */
export type Needs<A> = Types<A>['open'];

/** The Messages an Instance of `A` takes; any tagged value for an Address of no Actor in particular. */
export type MessageOf<A> = [Types<A>] extends [never]
  ? Tagged & { readonly [field: string]: unknown }
  : Types<A>['message'];

/** How a Runtime is made. */
export interface RuntimeSettings {
  /** The root's Input, for a new History. One given a History plays from that History's Input. */
  readonly input?: unknown;
  /** The History to carry on from, at its Head; a new one by default. */
  readonly history?: History;
  /** How many entries to keep on the Head's Branch: 100 by default, `0` for none but the app as it is now, `null` for every one. */
  readonly window?: number | null;
}

/** How a Runtime of `A` is made: with the app's Layer, which must cover every Capability the tree still needs. */
export type RuntimeOptions<A> = RuntimeSettings &
  ([Needs<A>] extends [never]
    ? { readonly layer?: Layer.Layer<never> }
    : { readonly layer: Layer.Layer<Needs<A>> });

/** The options, which may be left out only when the tree needs no Capability. */
export type OptionsFor<A> = [Needs<A>] extends [never]
  ? [options?: RuntimeOptions<A>]
  : [options: RuntimeOptions<A>];

/** The app right after one History entry, or right after init, as plain data: what a Seek gives. */
export interface Step<A = AnyActor> {
  /** The entry it is right after; `null` right after init. */
  readonly entry: number | null;
  /** Its Time: its entry's, or 0 at init. */
  readonly at: number;
  readonly snapshot: Snapshot<A>;
}

export interface Runtime<A = AnyActor> {
  readonly actor: A;
  /** The Snapshot at the Head. */
  readonly snapshot: Snapshot<A>;
  readonly history: History;
  /** Whether it runs: its Workers, Provides and Commands, and the Messages Sent to it. */
  readonly running: boolean;
  /** How many entries are kept on the Head's Branch, or `null` for every one. */
  readonly window: number | null;
  /**
   * Hand a Message to any Instance, from outside the tree unless said
   * otherwise: it becomes a History entry after the Head, is played at once
   * and its Commands run. Says what became of it: `refused` once the
   * Runtime is let go. Throws, changing nothing, when the Message does not
   * match its Schema, and `Stopped` while the Runtime is stopped.
   */
  send<B>(to: Address<B>, message: MessageOf<B>, from?: From): Sent;
  /** Run again at the Head: the Workers and Provides its data asks for start. No past Command runs again. */
  start(): Promise<void>;
  /** Stop all work, and Time with it. A Send is refused until it starts again. */
  stop(): Promise<void>;
  /**
   * Move the Head to an entry (`null`: init), so the next Message grows a
   * new Branch from it; the old one stays in the History. Running, the work
   * stops and starts again from that entry's data, running no Command;
   * stopped, only the Head moves. Always this same Runtime.
   */
  fork(entry: number | null): Promise<void>;
  /** The app right after an entry (`null`: init), on any Branch, as a Step. Changes nothing. */
  seek(entry: number | null): Step<A>;
  /** Change the Window, and Compact to it now, running or not. */
  keep(window: number | null): void;
  /** What an Instance's Workers are doing now. Empty while stopped. */
  workers(address: Address<any>): ReadonlyArray<WorkerStatus>;
  /** The root Instance, typed and always current, for code outside the tree: what it Sends comes from outside, named `from`. */
  instance(options: { readonly from: string }): LiveInstance<A>;
  /** Called once the Mailbox is empty, on every start, stop and Fork, and when it is let go. */
  subscribe(listener: () => void): () => void;
  /** The Snapshot now, then whenever `subscribe` is called; a slow reader gets only the latest. */
  readonly changes: Stream.Stream<Snapshot<A>>;
  /** The Time now, in milliseconds. Stands still while stopped. */
  now(): number;
  /** Stop, and let go of everything it holds. Nothing Sent after arrives. */
  dispose(): Promise<void>;
}

/** How many entries a Runtime keeps on the Head's Branch unless said. */
const DEFAULT_WINDOW = 100;

/** The services the Runtime's own work runs with: the clock, by default the real one. */
const environmentOf = (clock: Clock.Clock): Context.Context<never> =>
  Context.make(Clock.Clock, clock) as Context.Context<never>;

const realClock = () =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Clock.Clock;
    }),
  );

/** The Time of an entry (`null`: init, at 0). */
const timeOf = (history: History, entry: number | null) =>
  entry === null ? 0 : (History.entry(history, entry)?.at ?? 0);

// 1. Make
const open = <A extends AnyActor>(
  actor: A,
  options: RuntimeSettings & { readonly layer?: Layer.Layer<any> },
  environment: Context.Context<never>,
): Runtime<A> => {
  const root = actor.definition;
  const layer = options.layer;
  let window = options.window === undefined ? DEFAULT_WINDOW : options.window;
  let history = options.history ?? History.make({ input: options.input });
  let snapshot = Snapshot.replay(actor, history);
  history = History.compact(actor, history, window);

  const clock = Context.get(environment, Clock.Clock);
  const time = makeTime(
    () => clock.monotonicTimeNanosUnsafe(),
    timeOf(history, history.head),
  );
  const scope = Scope.makeUnsafe();
  let tree: LiveTree | undefined;
  /** Whether it should run, as the last start, stop or let go said. */
  let wanted = true;
  /** The tree that last stopped, until it has. */
  let stopping: Promise<void> = Promise.resolve();
  let disposing: Promise<void> | undefined;
  let services: Services | undefined;
  /** How many times the app has started over, by a Restore or a Fork: an Instance reached before is stopped after. */
  let runs = 0;

  const listeners = new Set<() => void>();
  /** Told right after each Message is played, for what waits on one Instance's data. */
  const observers = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  const observe = (observer: () => void) => {
    observers.add(observer);
    return () => void observers.delete(observer);
  };

  // 2. Send
  const deliver = (letter: Letter) => {
    // Sent by work that was stopping: nothing runs, so nothing is added.
    if (!tree) return 'dropped' as const;
    const grown = History.add(history, letter);
    // Throws before anything changes when the Message or the Update does not fit.
    const played = Snapshot.play(actor, snapshot, grown.entry);
    history = grown.history;
    snapshot = played.snapshot;
    remember(root, history.input, grown.entry, snapshot);
    const restarted = isRestore(letter.message) && played.outcome === 'handled';
    if (restarted) runs++;
    tree.follow(snapshot.root, restarted);
    tree.command(letter.to, played.commands);
    history = History.compact(actor, history, window);
    observers.forEach((observer) => observer());
    for (const { to, message, from } of played.emitted) post(to, message, from);
    return played.outcome;
  };
  const mailbox = makeMailbox(time.now, deliver, notify);
  /** Checked against its Actor's Schema first, so a Message that does not match throws at the Send that made it. */
  const post = (to: Address, message: Tagged, from: From): Sent => {
    if (!isRestore(message))
      actorAt(root, snapshot.root, to)?.check.message(
        message,
        `Message ${JSON.stringify(message._tag)}`,
      );
    return mailbox.send(to, message, from);
  };

  const host: Host = { send: post, now: time.now, services: environment };

  /** The app's Layer, built once, the first time the Runtime runs. */
  const built = () => {
    if (services) return services;
    const made = Deferred.makeUnsafe<Context.Context<never>>();
    forkIn(
      host,
      scope,
      `${root.name} Layer`,
      Layer.buildWithScope(
        (layer ?? Layer.empty) as Layer.Layer<never>,
        scope,
      ).pipe(
        Effect.flatMap((context) =>
          Deferred.succeed(made, Context.merge(environment, context)),
        ),
      ),
    );
    return (services = made);
  };

  // 3. Run
  const run = () => {
    time.start();
    mailbox.hold(() => {
      tree = LiveTree.start(root, snapshot.root, host, scope, built());
    });
    notify();
  };

  // 4. Stop
  /** Stop the tree, if one runs: at once for the Runtime, its Workers' finalizers after. */
  const halt = (): Promise<void> => {
    if (!tree) return stopping;
    const stopped = tree;
    tree = undefined;
    time.stop();
    notify();
    return (stopping = stopping.then(() =>
      Effect.runPromiseWith(environment)(stopped.stop()),
    ));
  };

  const stop = (): Promise<void> => {
    wanted = false;
    return halt();
  };

  const start = (): Promise<void> => {
    if (disposing) return Promise.resolve();
    wanted = true;
    return stopping.then(() => {
      if (wanted && !disposing && !tree) run();
    });
  };

  // 5. Fork
  const fork = (entry: number | null): Promise<void> => {
    if (disposing) return Promise.resolve();
    let moved: History;
    try {
      moved = History.go(history, entry);
    } catch (error) {
      return Promise.reject(error);
    }
    const halted = halt();
    history = History.compact(actor, moved, window);
    snapshot = Snapshot.replay(actor, history);
    runs++;
    time.stop(timeOf(history, history.head));
    notify();
    return wanted ? start() : halted;
  };

  // 6. Seek
  const seek = (entry: number | null): Step<A> => ({
    entry,
    at: timeOf(history, entry),
    snapshot: Snapshot.replay(actor, history, entry) as Snapshot<A>,
  });

  // 7. Let go
  const dispose = (): Promise<void> => {
    if (disposing) return disposing;
    wanted = false;
    mailbox.close();
    disposing = halt().then(() =>
      Effect.runPromiseWith(environment)(Scope.close(scope, Exit.void)),
    );
    notify();
    return disposing;
  };

  /** Asks one of an Instance's Queries by name: `Stopped` while the Runtime is. */
  const query = (address: Address, name: string, args: unknown) =>
    Effect.suspend(
      () =>
        tree?.query(address, name, args) ??
        Effect.fail(new Stopped({ instance: address, query: name })),
    );

  const runtime: Runtime<A> = {
    actor,
    get snapshot() {
      return snapshot as Snapshot<A>;
    },
    get history() {
      return history;
    },
    get running() {
      return tree !== undefined;
    },
    get window() {
      return window;
    },
    send: (to, message, from = { kind: 'outside' }) => {
      if (!tree && !disposing) throw new Stopped({ instance: to as Address });
      return post(to as Address, message as Tagged, from);
    },
    start,
    stop,
    fork,
    seek,
    keep: (next) => {
      history = History.compact(actor, history, next);
      window = next;
      notify();
    },
    workers: (address) => tree?.workers(address) ?? [],
    instance: ({ from }) =>
      reach<A>(
        {
          root: () => snapshot.root,
          gone: () => disposing !== undefined,
          send: (to, message, by) => (tree ? post(to, message, by) : 'refused'),
          subscribe,
          observe,
          workers: (address) => tree?.workers(address) ?? [],
          query,
          run: () => runs,
        },
        root,
        from,
      ),
    subscribe,
    changes: Stream.callback<Snapshot<A>>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const offer = () =>
              void Queue.offerUnsafe(queue, snapshot as Snapshot<A>);
            offer();
            return subscribe(offer);
          }),
          (unsubscribe) => Effect.sync(unsubscribe),
        ),
      { bufferSize: 1, strategy: 'sliding' },
    ),
    now: time.now,
    dispose,
  };

  run();
  return runtime;
};

/** Make a Runtime, running, on a new History unless given one. */
const make = <A extends AnyActor>(
  actor: A,
  ...[options]: OptionsFor<A>
): Runtime<A> =>
  open(actor, (options ?? {}) as RuntimeSettings, environmentOf(realClock()));

/** Make a Runtime for Effect code: on the clock it runs with, and let go when its Scope closes. */
const scoped = <A extends AnyActor>(
  actor: A,
  ...[options]: OptionsFor<A>
): Effect.Effect<Runtime<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const runtime = open(
      actor,
      (options ?? {}) as RuntimeSettings,
      environmentOf(clock),
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()));
    return runtime;
  });

/** What an app runs as: its History, the Snapshot at its Head, and whether it runs. */
export const Runtime = { make, scoped };
