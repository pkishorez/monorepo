import { Clock, Context, Deferred, Effect, Exit, Fiber, Scope } from 'effect';
import type { AnyActor, Tagged, Types } from '../actor/index.ts';
import { handle, init } from '../snapshot/index.ts';
import type { Envelope, Snapshot } from '../snapshot/index.ts';
import { Log } from '../log/index.ts';
import type { Entry, RuntimeState } from '../log/index.ts';
import { Replay } from '../replay/index.ts';
import type { ReplayOptions } from '../replay/index.ts';
import { makeMailbox } from './mailbox.ts';
import { reconcile } from './reconcile.ts';
import { makeTime } from './time.ts';
import { makeWorks } from './work.ts';
import type { Works } from './work.ts';

/*
 * The live app: the Snapshot, its Log, and the work that connects it to the
 * outside world.
 *
 * 1. Start     the root is created from init, and goes live with the
 *              Capabilities of the app's Layer. Time starts at 0 on Effect's
 *              monotonic Clock, which Commands and Lifetimes use too. Given a
 *              saved Log, the Runtime Replays to its Head and goes live there.
 * 2. Deliver   each Envelope: `handle` makes the next Snapshot, `reconcile`
 *              stops and starts work where it landed, the Update's Command
 *              runs, and the entry is appended to the Log after the Head.
 * 3. Stop      closes the live Scope: every Lifetime, Command and Capability
 *              ends. The Snapshot and the Log stay, Time stands still, and
 *              nothing can Send.
 * 4. Start     from any entry Replays the Branch to it and goes live there:
 *              new Messages grow a new Branch. With no entry, it resumes.
 * 5. Show      the Snapshot right after any entry, on any Branch, or live.
 *
 * Stop, start and show are Effects; a new one interrupts the one still running.
 */

/** Capabilities an Actor's tree still needs from the app's Layer. */
export type Needs<A> = Types<A>['open'];

export interface RuntimeOptions extends ReplayOptions {
  /** The root's Input. */
  readonly input?: unknown;
  /** A Log saved before, to carry on from its Head. */
  readonly saved?: RuntimeState;
}

/** A running app: its Snapshot, its Log, and the controls to stop, start and show. */
export interface Running<A> {
  /** The live Snapshot. */
  readonly snapshot: () => Snapshot;
  /** What to draw: the live Snapshot, or the one right after the entry shown. */
  readonly drawn: () => Snapshot;
  /** Hand a Message to an Instance. Dropped while stopped. */
  readonly send: (
    instance: string,
    message: Tagged & { readonly [field: string]: unknown },
  ) => void;
  /** The Time now, in milliseconds. It stands still while stopped. */
  readonly now: () => number;
  /** The whole Log, as one value. */
  readonly state: () => RuntimeState;
  /** Called after every change: once the mailbox is empty, and on stop, start and show. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The current Branch: every entry from the first to the Head. */
  readonly log: () => ReadonlyArray<Entry>;
  /** The entries that follow an entry; `null` for right after init. */
  readonly children: (of: number | null) => ReadonlyArray<Entry>;
  /** Show the Snapshot right after an entry, on any Branch, or live with `null`. */
  readonly show: (entry: number | null) => Effect.Effect<void>;
  /** Close every Lifetime, Command and Capability. The Snapshot and the Log stay. */
  readonly stop: () => Effect.Effect<void>;
  /**
   * Start from an entry (`null`: right after init), growing a new Branch from
   * it; with no entry, resume from the Head. Stops first if running.
   */
  readonly start: (from?: number | null) => Effect.Effect<void>;
  /** The root Actor's type, for Views. */
  readonly actor?: A;
}

// 1. Start ---------------------------------------------------------------------

const start = <A extends AnyActor>(
  actor: A,
  options: RuntimeOptions = {},
): Effect.Effect<Running<A>, never, Needs<A> | Scope.Scope> =>
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const outer = yield* Effect.scope;
    const time = makeTime(() => clock.monotonicTimeNanosUnsafe());
    // Commands and Lifetimes run on the Clock the Runtime was started with.
    const services = Context.add(
      (yield* Effect.context<Needs<A>>()) as Context.Context<never>,
      Clock.Clock,
      clock,
    ) as Context.Context<never>;

    const root = actor.definition;
    const { every = 100 } = options;
    const log = Log.make(options.saved);
    const replay = Replay.make(root, options.input, options);
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };

    let snapshot: Snapshot = init(root, options.input);
    let drawn = snapshot;
    let live: Scope.Closeable | undefined;
    let works: Works | undefined;
    let depth = 0;
    let closed = false;
    replay.save(null, snapshot);

    // 2. Deliver
    const deliver = (envelope: Envelope) => {
      const handled = handle(root, snapshot, envelope);
      snapshot = handled.snapshot;
      if (log.get().shown === null) drawn = snapshot;
      const { change } = handled;
      if (change && works) {
        reconcile(works, change.definition, change.before, change.after);
        works.command(change.after, change.command, change.cancel);
      }
      const entry = log.append({
        ...envelope,
        outcome: handled.outcome,
        from: handled.from,
        to: handled.to,
      });
      if (++depth % every === 0) replay.save(entry.id, snapshot);
    };
    const mailbox = makeMailbox(
      time.now,
      () => log.get().running,
      deliver,
      notify,
    );

    /** Hand a Snapshot to fresh work, and carry on from Time `at`. */
    const goLive = (next: Snapshot, at: number, head: number | null) => {
      const scope = Scope.forkUnsafe(outer);
      const capabilities = Deferred.makeUnsafe<Context.Context<never>>();
      Deferred.doneUnsafe(capabilities, Effect.succeed(services));
      const fresh = makeWorks(services, mailbox.send);
      live = scope;
      works = fresh;
      snapshot = drawn = next;
      depth = log.branch(head).length;
      time.start(at);
      log.set({ head, running: true, shown: null });
      mailbox.hold(() => fresh.start(next, root, { scope, capabilities }));
      notify();
    };

    // 3. Stop
    const halt = Effect.suspend(() => {
      const scope = live;
      if (!log.get().running || !scope) return Effect.void;
      time.stop();
      live = works = undefined;
      log.set({ running: false });
      notify();
      return Scope.close(scope, Exit.void);
    });

    // 4. Start
    const startFrom = (from?: number | null) =>
      Effect.gen(function* () {
        if (closed) return;
        const { entries, head } = log.get();
        const target = from === undefined ? head : from;
        if (target !== null && !entries[target])
          return yield* Effect.die(
            new RangeError(`[effect-oak] no Log entry ${target}`),
          );
        yield* halt;
        // A resume carries on from the Time it stopped at; a fork from its entry's.
        if (from === undefined) return goLive(snapshot, time.now(), head);
        const next = yield* replay.seek(log.branch(target));
        goLive(next, target === null ? 0 : entries[target]!.at, target);
      });

    // 5. Show
    const show = (entry: number | null) =>
      Effect.gen(function* () {
        if (entry === null) {
          drawn = snapshot;
        } else {
          if (!log.get().entries[entry])
            return yield* Effect.die(
              new RangeError(`[effect-oak] no Log entry ${entry}`),
            );
          drawn = yield* replay.seek(log.branch(entry));
        }
        log.set({ shown: entry });
        notify();
      });

    /** A new stop, start or show interrupts the one still running. */
    let current: Fiber.Fiber<void> | undefined;
    const latest = (effect: Effect.Effect<void>) =>
      Effect.suspend(() => {
        current?.interruptUnsafe();
        const fiber = Effect.runForkWith(services)(effect);
        current = fiber;
        return Fiber.join(fiber);
      });

    const { head } = log.get();
    if (options.saved && head !== null) {
      const next = yield* replay.seek(log.branch(head));
      goLive(next, log.get().entries[head]!.at, head);
    } else goLive(snapshot, 0, head);

    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        closed = true;
        current?.interruptUnsafe();
        return halt;
      }),
    );

    return {
      snapshot: () => snapshot,
      drawn: () => drawn,
      send: mailbox.send,
      now: time.now,
      state: log.get,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      log: () => log.branch(log.get().head),
      children: log.children,
      show: (entry) => latest(show(entry)),
      stop: () => latest(halt),
      start: (from) => latest(startFrom(from)),
    };
  });

/** The running app: the Snapshot, the Log, and the work in flight. */
export const Runtime = { start };
