import { Clock, Context, Deferred, Effect, Exit, Fiber, Scope } from 'effect';
import type { AnyActor, Tagged, Types } from '../actor/index.ts';
import { actorAt, handle, init, outcomeOf } from '../snapshot/index.ts';
import type { Envelope, Handled, Snapshot, Source } from '../snapshot/index.ts';
import { Log } from '../log/index.ts';
import type { Entry, RuntimeState } from '../log/index.ts';
import { Replay } from '../replay/index.ts';
import type { ReplayOptions } from '../replay/index.ts';
import { isRestore } from '../snapshot/index.ts';
import { makeMailbox } from './mailbox.ts';
import { reconcile } from './reconcile.ts';
import { makeTime } from './time.ts';
import { makeWorks } from './work.ts';
import type { WorkerStatus, Works } from './work.ts';

/*
 * The live app: the Snapshot, its Log, and the work that connects it to the
 * outside world.
 *
 * 1. Start     the root is created from init, and goes live with the
 *              Capabilities of the app's Layer. Time starts at 0 on Effect's
 *              monotonic Clock, which Commands and Workers use too. Given a
 *              saved Log, the Runtime Replays to its Head and carries on as
 *              the Log says: live there, stopped there, or showing an entry.
 * 2. Deliver   each Message, checked against its Actor's Schema as it is
 *              Sent, so a bad one throws in the code that Sent it and never
 *              reaches the mailbox. `handle` makes the next Snapshot, `reconcile`
 *              stops and starts work where it landed, the Update's Commands
 *              run, and the Envelope is appended to the Log after the Head.
 *              What came of it is remembered beside the Log, never in it.
 * 3. Stop      closes the live Scope: every Worker, Command and Capability
 *              ends. The Snapshot and the Log stay, Time stands still, and
 *              nothing can Send.
 * 4. Start     from any entry Replays the Branch to it and goes live there:
 *              new Messages grow a new Branch. With no entry, it resumes.
 * 5. Show      the Snapshot right after init or any entry, on any Branch,
 *              or live.
 * 6. Read      the Snapshot right after any entry, played from the one before
 *              it and remembered, and what came of the entry, for code that
 *              takes the app apart.
 * 7. Clear     forgets every entry on every Branch and goes live from init.
 *
 * Stop, start and show are Effects; a new one interrupts the one still running.
 */

/** Capabilities an Actor's tree still needs from the app's Layer. */
export type Needs<A> = Types<A>['open'];

export interface RuntimeOptions extends ReplayOptions {
  /** The root's Input. */
  readonly input?: unknown;
  /** A Log saved before, to carry on from its Head, stopped or running, showing what it showed. */
  readonly saved?: RuntimeState;
  /** A Replay of the saved Log, made with the same Input, to reuse what it has already played. Not with `input`. */
  readonly replay?: Replay;
}

/** A running app: its Snapshot, its Log, and the controls to stop, start and show. */
export interface Running<A> {
  /** The live Snapshot. */
  readonly snapshot: () => Snapshot;
  /** What to draw: the live Snapshot, or the one right after the entry shown. */
  readonly drawn: () => Snapshot;
  /** Hand a Message to an Instance, from outside the tree unless said otherwise. Dropped while stopped. */
  readonly send: (
    instance: string,
    message: Tagged & { readonly [field: string]: unknown },
    source?: Source,
  ) => void;
  /** The Snapshot right after an entry, on any Branch; `null` for right after init. */
  readonly snapshotAt: (entry: number | null) => Snapshot;
  /**
   * What came of an entry: handled, ignored because no rule took it, or
   * dropped because its Instance was gone. Worked out, never kept in the
   * Log; an entry that diverged on Replay counts as ignored.
   */
  readonly outcome: (entry: number) => Handled['outcome'];
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
  /** Show the Snapshot right after init or an entry, on any Branch, or live with `null`. */
  readonly show: (entry: number | 'init' | null) => Effect.Effect<void>;
  /** Close every Worker, Command and Capability. The Snapshot and the Log stay. */
  readonly stop: () => Effect.Effect<void>;
  /** What an Instance's Workers are doing now: live only, never in the Snapshot. Empty while stopped. */
  readonly workers: (instance: string) => ReadonlyArray<WorkerStatus>;
  /**
   * Start from an entry (`null`: right after init), growing a new Branch from
   * it; with no entry, resume from the Head. Stops first if running.
   */
  readonly start: (from?: number | null) => Effect.Effect<void>;
  /** Forget the whole Log, every Branch, and go live from init. */
  readonly clear: () => Effect.Effect<void>;
  /** The root Actor's type, for Views. */
  readonly actor?: A;
}

// 1. Start ---------------------------------------------------------------------

const start = <A extends AnyActor>(
  actor: A,
  options: RuntimeOptions = {},
): Effect.Effect<Running<A>, never, Needs<A> | Scope.Scope> =>
  Effect.gen(function* () {
    if (options.replay && options.input !== undefined)
      return yield* Effect.die(
        new Error(
          '[effect-oak] give the Input to the Replay, not to the Runtime with it',
        ),
      );
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
    let log = Log.make(options.saved);
    let replay = options.replay ?? Replay.make(root, options.input, options);
    const listeners = new Set<() => void>();
    const notify = () => {
      for (const listener of listeners) listener();
    };

    // A shared Replay's init, so what was drawn before stays the same objects.
    let snapshot: Snapshot = options.replay
      ? yield* replay.seek([])
      : init(root, options.input);
    let drawn = snapshot;
    const played = new Map<number | null, Snapshot>([[null, snapshot]]);
    const outcomes = new Map<number, Handled['outcome']>();
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
        works.command(change.after, change.commands);
      }
      const entry = log.append(envelope);
      outcomes.set(entry.id, handled.outcome);
      if (++depth % every === 0) replay.save(entry.id, snapshot);
    };
    const mailbox = makeMailbox(
      time.now,
      () => log.get().running,
      deliver,
      notify,
    );
    const send = (instance: string, message: Tagged, source: Source) => {
      if (!isRestore(message))
        actorAt(root, snapshot, instance)?.check.message(
          message,
          `Message ${JSON.stringify(message._tag)}`,
        );
      mailbox.send(instance, message, source);
    };

    /** Hand a Snapshot to fresh work, and carry on from Time `at`. */
    const goLive = (next: Snapshot, at: number, head: number | null) => {
      const scope = Scope.forkUnsafe(outer);
      const capabilities = Deferred.makeUnsafe<Context.Context<never>>();
      Deferred.doneUnsafe(capabilities, Effect.succeed(services));
      const fresh = makeWorks(services, send, time.now);
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
    const show = (entry: number | 'init' | null) =>
      Effect.gen(function* () {
        if (entry === null) {
          drawn = snapshot;
        } else if (entry === 'init') {
          drawn = yield* replay.seek([]);
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

    // 6. Read
    const snapshotAt = (entry: number | null) => {
      const { entries } = log.get();
      const path: Array<Entry> = [];
      let at = entry;
      while (!played.has(at)) {
        const next: Entry = entries[at!]!;
        path.push(next);
        at = next.parent;
      }
      let found = played.get(at)!;
      for (const next of path.reverse()) {
        found = Replay.play(root, found, next);
        played.set(next.id, found);
      }
      return found;
    };

    const outcome = (id: number) => {
      let known = outcomes.get(id);
      if (known) return known;
      const entry = log.get().entries[id];
      if (!entry) throw new RangeError(`[effect-oak] no Log entry ${id}`);
      known = outcomeOf(root, snapshotAt(entry.parent), entry);
      outcomes.set(id, known);
      return known;
    };

    // 7. Clear
    const clear = Effect.gen(function* () {
      if (closed) return;
      yield* halt;
      log = Log.make();
      replay = Replay.make(root, options.input, options);
      const first = init(root, options.input);
      played.clear();
      played.set(null, first);
      outcomes.clear();
      replay.save(null, first);
      goLive(first, 0, null);
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

    const { head, entries, running, shown } = log.get();
    const first =
      head === null ? snapshot : yield* replay.seek(log.branch(head));
    const at = head === null ? 0 : entries[head]!.at;
    if (!options.saved || running) goLive(first, at, head);
    else {
      // Saved stopped: the Snapshot and Time are the Head's, and nothing runs.
      snapshot = drawn = first;
      time.start(at);
      time.stop();
      log.set({ head, running: false, shown: null });
    }
    if (shown !== null) yield* show(shown);

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
      send: (instance, message, source = { kind: 'outside' }) =>
        send(instance, message, source),
      snapshotAt,
      outcome,
      now: time.now,
      state: () => log.get(),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      log: () => log.branch(log.get().head),
      children: (of) => log.children(of),
      show: (entry) => latest(show(entry)),
      stop: () => latest(halt),
      workers: (instance) => works?.workers(instance) ?? [],
      start: (from) => latest(startFrom(from)),
      clear: () => latest(clear),
    };
  });

/** The running app: the Snapshot, the Log, and the work in flight. */
export const Runtime = { start };
