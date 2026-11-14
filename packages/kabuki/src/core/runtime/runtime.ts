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
import { actorAt, Snapshot } from '../snapshot/index.ts';
import type { Address, Entry, From } from '../snapshot/index.ts';
import { LiveTree, Stopped, forkIn } from './live/index.ts';
import type { Host, Services } from './live/index.ts';
import { makeMailbox } from './mailbox.ts';
import type { Sent } from './mailbox.ts';
import { reach } from './reach.ts';
import type { LiveInstance } from './reach.ts';
import { makeTime } from './time.ts';

export type { LiveInstance } from './reach.ts';
export { Stopped } from './live/index.ts';
export type { WorkerStatus } from './live/index.ts';
export type { Sent } from './mailbox.ts';

/*
 * The Runtime: a Snapshot kept alive, one per app. It holds the Snapshot
 * and no other data: its live tree (./live) is the same tree, running the
 * work each Instance's data asks for. It runs from the moment it is made,
 * unless made stopped.
 *
 * 1. Make    from a Snapshot, or from the root's Input: carry Time on from
 *            the Snapshot's Time, and run, unless made stopped: then it
 *            runs nothing until it starts.
 * 2. Send    a Message, stamped with its Time, into the one Mailbox. Each
 *            one gives the next Snapshot by a pure step, which the tree
 *            follows; then the Commands its Update asked for run, and what
 *            it Emits is Sent next. Only while it runs: stopped, a Send is
 *            refused and changes nothing.
 * 3. Follow  a Snapshot handed in: the tree changes only what differs, so
 *            work the old and the new Snapshot both ask for is not
 *            touched; or, asked to restart, all work stops and starts
 *            again from it. No Command runs.
 * 4. Run     start the tree from the Snapshot, hosted by the Mailbox, the
 *            Time and the app's Layer, built once. No Command runs twice:
 *            starting again starts only the work the data asks for.
 * 5. Stop    the tree: every Worker, Provide and Command ends, and Time
 *            stands still until it runs again.
 * 6. Let go  stop, close the Mailbox and the Layer.
 *
 * It keeps no History. Whoever subscribes is told the entries it played,
 * to keep them in one. Work can Send as it starts, so to miss no entry,
 * make the Runtime stopped, subscribe, then start it.
 */

/** Capabilities an Actor's tree still needs from the app's Layer. */
export type Needs<A> = Types<A>['open'];

/** The Messages an Instance of `A` takes; any tagged value for an Address of no Actor in particular. */
export type MessageOf<A> = [Types<A>] extends [never]
  ? Tagged & { readonly [field: string]: unknown }
  : Types<A>['message'];

/** What a Runtime starts from. */
export interface RuntimeSettings<A = AnyActor> {
  /** The Snapshot to run: the app carries on from it. By default the app right after init. */
  readonly snapshot?: Snapshot<A>;
  /** The root's Input, for init: read only when no Snapshot is given. */
  readonly input?: unknown;
  /**
   * Whether it runs from the moment it is made, as by default. Made with
   * `false`, it holds its Snapshot and runs nothing until `start()`: whoever
   * subscribes before then is told every entry.
   */
  readonly running?: boolean;
}

/** How a Runtime of `A` is made: with the app's Layer, which must cover every Capability the tree still needs. */
export type RuntimeOptions<A> = RuntimeSettings<A> &
  ([Needs<A>] extends [never]
    ? { readonly layer?: Layer.Layer<never> }
    : { readonly layer: Layer.Layer<Needs<A>> });

/** The options, which may be left out only when the tree needs no Capability. */
export type OptionsFor<A> = [Needs<A>] extends [never]
  ? [options?: RuntimeOptions<A>]
  : [options: RuntimeOptions<A>];

export interface Runtime<A = AnyActor> {
  readonly actor: A;
  /** The app as data, now. */
  readonly snapshot: Snapshot<A>;
  /** Whether it runs: its Workers, Provides and Commands, and the Messages Sent to it. */
  readonly running: boolean;
  /** The root Instance, live and typed: walk down from it to any Instance, and Send to it. */
  readonly root: LiveInstance<A>;
  /**
   * The Instance at an Address, the same one walking down from the root
   * reaches, typed by the Address's Actor; none if it is not in the tree
   * now.
   */
  at<B>(address: Address<B>): LiveInstance<B> | undefined;
  /**
   * Become a Snapshot handed in, and carry Time on from its Time. The tree
   * changes only what differs: a Worker both Snapshots ask for, at the same
   * Address, is not touched. With `restart`, all work stops and starts
   * again from it. Either way no Command runs. Stopped, only the Snapshot
   * changes. Done once the new Snapshot is in place and, restarting, the
   * work runs again.
   */
  follow(
    snapshot: Snapshot<A>,
    options?: { readonly restart?: boolean },
  ): Promise<void>;
  /** Run again from its Snapshot: the Workers and Provides its data asks for start, at once unless work is still stopping. No past Command runs again. */
  start(): Promise<void>;
  /** Stop all work, and Time with it. A Send is refused until it starts again. */
  stop(): Promise<void>;
  /**
   * Called once the Mailbox is empty, with the entries played since the
   * last call, oldest first; and on every start, stop and Snapshot
   * followed, and when it is let go, with none. Returns how to stop.
   */
  subscribe(listener: (entries: ReadonlyArray<Entry>) => void): () => void;
  /** The Snapshot now, then whenever `subscribe` is called; a slow reader gets only the latest. */
  readonly changes: Stream.Stream<Snapshot<A>>;
  /** The Time now, in milliseconds. Stands still while stopped. */
  now(): number;
  /** Stop, and let go of everything it holds. Nothing Sent after arrives. */
  dispose(): Promise<void>;
}

/** The services the Runtime's own work runs with: the clock, by default the real one. */
const environmentOf = (clock: Clock.Clock): Context.Context<never> =>
  Context.make(Clock.Clock, clock) as Context.Context<never>;

const realClock = () =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* Clock.Clock;
    }),
  );

const NONE: ReadonlyArray<Entry> = [];

/** The options as `open` reads them, whatever Layer the tree needs. */
type Made<A> = RuntimeSettings<A> & { readonly layer?: Layer.Layer<any> };

// 1. Make
const open = <A extends AnyActor>(
  actor: A,
  options: Made<A>,
  environment: Context.Context<never>,
): Runtime<A> => {
  const root = actor.definition;
  const layer = options.layer;
  let snapshot: Snapshot = checked(
    actor,
    options.snapshot ?? Snapshot.init(actor, options.input),
  );

  const clock = Context.get(environment, Clock.Clock);
  const time = makeTime(() => clock.monotonicTimeNanosUnsafe(), snapshot.at);
  const scope = Scope.makeUnsafe();
  let tree: LiveTree | undefined;
  /** Whether it should run, as it was made, or as the last start, stop or let go said. */
  let wanted = options.running !== false;
  /** The tree that last stopped, until it has. */
  let stopping: Promise<void> = Promise.resolve();
  /** How many trees are still stopping: with none, a start runs at once. */
  let halting = 0;
  let disposing: Promise<void> | undefined;
  let services: Services | undefined;

  /** The entries played since subscribers were last told. */
  let played: Array<Entry> = [];
  const listeners = new Set<(entries: ReadonlyArray<Entry>) => void>();
  /** Told right after each Message is played, for what waits on one Instance's data. */
  const observers = new Set<() => void>();
  const notify = () => {
    const entries = played.length === 0 ? NONE : played;
    played = [];
    listeners.forEach((listener) => listener(entries));
  };
  const subscribe = (listener: (entries: ReadonlyArray<Entry>) => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  const observe = (observer: () => void) => {
    observers.add(observer);
    return () => void observers.delete(observer);
  };

  // 2. Send
  const deliver = (entry: Entry) => {
    // Sent by work that was stopping: nothing runs, so nothing changes.
    const running = tree;
    if (!running) return 'dropped' as const;
    // Throws before anything changes when the Message or the Update does not fit.
    const next = Snapshot.next(actor, snapshot as Snapshot<A>, entry);
    snapshot = next.snapshot;
    played.push(entry);
    running.follow(snapshot.root);
    // Work that starts as the tree follows may stop the Runtime: its Commands are then lost, as at any stop.
    if (tree === running) running.command(entry.to, next.commands);
    observers.forEach((observer) => observer());
    for (const { to, message, from } of next.emitted) post(to, message, from);
    return next.outcome;
  };
  const mailbox = makeMailbox(time.now, deliver, notify);
  /** Checked against its Actor's Schema first, so a Message that does not match throws at the Send that made it. */
  const post = (to: Address, message: Tagged, from: From): Sent => {
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

  // 4. Run
  const run = () => {
    time.start();
    mailbox.hold(() => {
      tree = LiveTree.start(root, snapshot.root, host, scope, built());
    });
    notify();
  };

  // 5. Stop
  /** Stop the tree, if one runs: at once for the Runtime, its Workers' finalizers after. */
  const halt = (): Promise<void> => {
    if (!tree) return stopping;
    const stopped = tree;
    tree = undefined;
    time.stop();
    notify();
    halting++;
    return (stopping = stopping
      .then(() => Effect.runPromiseWith(environment)(stopped.stop()))
      .finally(() => void halting--));
  };

  const stop = (): Promise<void> => {
    wanted = false;
    return halt();
  };

  const start = (): Promise<void> => {
    if (disposing) return Promise.resolve();
    wanted = true;
    // With nothing still stopping, at once: no Message is refused in between.
    if (halting === 0) {
      try {
        if (!tree) run();
      } catch (error) {
        return Promise.reject(error);
      }
      return Promise.resolve();
    }
    return stopping.then(() => {
      if (wanted && !disposing && !tree) run();
    });
  };

  // 3. Follow
  const follow = (
    next: Snapshot<A>,
    options?: { readonly restart?: boolean },
  ): Promise<void> => {
    if (disposing) return Promise.resolve();
    let given: Snapshot;
    try {
      given = checked(actor, next);
    } catch (error) {
      return Promise.reject(error);
    }
    if (options?.restart) {
      const halted = halt();
      snapshot = given;
      time.set(given.at);
      notify();
      return wanted ? start() : halted;
    }
    // In its turn, so it never lands in the middle of a Message.
    return new Promise<void>((resolve, reject) => {
      const become = () => {
        try {
          snapshot = given;
          time.set(given.at);
          tree?.follow(given.root);
          observers.forEach((observer) => observer());
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      mailbox.run(become);
    });
  };

  // 6. Let go
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

  /** What reaching an Instance needs of this Runtime. */
  const reachable = {
    root: () => snapshot.root,
    gone: () => disposing !== undefined,
    send: (to: Address, message: Tagged, from: From): Sent =>
      tree ? post(to, message, from) : 'refused',
    subscribe: (listener: () => void) => subscribe(listener),
    observe,
    workers: (address: Address) => tree?.workers(address) ?? [],
    /** Asks one of an Instance's Queries by name: `Stopped` while the Runtime is. */
    query: (address: Address, name: string, args: unknown) =>
      Effect.suspend(
        () =>
          tree?.query(address, name, args) ??
          Effect.fail(new Stopped({ instance: address, query: name })),
      ),
  };
  /** The root never leaves the tree, so one handle reads it for the Runtime's whole life. */
  const top = reach(reachable, root, root.name as Address)!;

  const runtime: Runtime<A> = {
    actor,
    get snapshot() {
      return snapshot as Snapshot<A>;
    },
    get running() {
      return tree !== undefined;
    },
    root: top as unknown as LiveInstance<A>,
    at: ((address: Address) =>
      reach(reachable, root, address)) as Runtime<A>['at'],
    follow,
    start,
    stop,
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

  if (wanted) run();
  return runtime;
};

/** The Snapshot, if it is one of this Actor's tree. Throws if its root is another's. */
const checked = (actor: AnyActor, snapshot: Snapshot<any>): Snapshot => {
  if (snapshot?.root?.address !== actor.name)
    throw new TypeError(
      `[@kestack/kabuki] a Runtime of ${actor.name} cannot run a Snapshot whose root is ${snapshot?.root?.address}`,
    );
  return snapshot as Snapshot;
};

/** Make a Runtime from a Snapshot, or from the root's Input, running, with the app's Layer. */
const make = <A extends AnyActor>(
  actor: A,
  ...[options]: OptionsFor<A>
): Runtime<A> =>
  open(actor, (options ?? {}) as Made<A>, environmentOf(realClock()));

/** Make a Runtime for Effect code: on the clock it runs with, and let go when its Scope closes. */
const scoped = <A extends AnyActor>(
  actor: A,
  ...[options]: OptionsFor<A>
): Effect.Effect<Runtime<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const runtime = open(
      actor,
      (options ?? {}) as Made<A>,
      environmentOf(clock),
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()));
    return runtime;
  });

/** What an app runs as: its Snapshot, kept alive. */
export const Runtime = { make, scoped };
