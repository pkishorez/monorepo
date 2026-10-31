import { Clock, Context, Effect, Fiber, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import type { AnyActor, Tagged, Types } from '../actor/index.ts';
import { actorAt, isRestore } from '../snapshot/engine/index.ts';
import type { Snapshot, Source } from '../snapshot/index.ts';
import { History } from '../history/index.ts';
import { ActorInstance, Stopped } from './instance/index.ts';
import type { Provided, WorkerStatus } from './instance/index.ts';
import { makeMailbox } from './mailbox.ts';
import type { Sent } from './mailbox.ts';
import { reach } from './reach.ts';
import type { LiveInstance } from './reach.ts';
import { makeTime } from './time.ts';

/*
 * The Runtime runs an Actor's History.
 *
 * 1. Start  at the History's Head: replay to it, carry Time on from its
 *           Time, and start the root Instance there, hosted by the one
 *           Mailbox, the Time and the app's Layer.
 * 2. Send   a Message, checked against its Actor's Schema, into the
 *           Mailbox. The Mailbox hands each one to the root Instance, writes
 *           it into the History, and tells subscribers once it is empty.
 * 3. Stop   close the Mailbox, stand Time still, and stop the root Instance:
 *           everything it runs ends. The Snapshot and the History stay.
 *
 * To branch off: stop, move the History's Head, start. `start(entry)` does
 * all three.
 *
 * Started from an Actor, as a server does, its History keeps no Messages,
 * only the app as it is now: a History made with a Window keeps more.
 */

/** Capabilities an Actor's tree still needs from the app's Layer. */
export type Needs<A> = Types<A>['open'];

/** The app's Layer, which must cover every Capability the tree still needs. */
type LayerFor<A> = [Needs<A>] extends [never]
  ? [layer?: Layer.Layer<never>]
  : [layer: Layer.Layer<Needs<A>>];

export interface Running<A> {
  readonly history: History<A>;
  /** The live Snapshot; the last one while stopped. */
  readonly snapshot: () => Snapshot;
  readonly running: () => boolean;
  /** The Time now, in milliseconds. It stands still while stopped. */
  readonly now: () => number;
  /** The root Instance, typed and live, for code outside the tree: what it Sends comes from outside, named `from`. */
  readonly instance: (options: { readonly from: string }) => LiveInstance<A>;
  /** Hand a Message to any Instance, from outside the tree unless said otherwise; says what became of it. Refused while stopped. */
  readonly send: (
    instance: string,
    message: Tagged & { readonly [field: string]: unknown },
    source?: Source,
  ) => Sent;
  /** Called once the Mailbox is empty, and on every start and stop. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The live Snapshot now, then whenever `subscribe` is called; a slow reader gets only the latest. */
  readonly changes: Stream.Stream<Snapshot>;
  /** What an Instance's Workers are doing now. Empty while stopped. */
  readonly workers: (instance: string) => ReadonlyArray<WorkerStatus>;
  /** The Capabilities an Instance provides to everything under it now, by key. Empty while stopped. */
  readonly provided: (instance: string) => Provided;
  /** Start at the Head, or move the Head to an entry first (`null`: init). Stops first if running. */
  readonly start: (from?: number | null) => Effect.Effect<void>;
  readonly stop: () => Effect.Effect<void>;
}

const start = <A extends AnyActor>(
  from: A | History<A>,
  ...layer: LayerFor<A>
): Effect.Effect<Running<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    // A History holds its Actor; an Actor is started on a History of its own.
    const history = 'actor' in from ? from : History.make(from, { window: 0 });
    const root = history.actor.definition;
    const scope = yield* Effect.scope;
    const clock = yield* Clock.Clock;
    const built = yield* Layer.build(layer[0] ?? Layer.empty);
    const services = Context.add(
      built,
      Clock.Clock,
      clock,
    ) as Context.Context<never>;
    const time = makeTime(() => clock.monotonicTimeNanosUnsafe());
    const listeners = new Set<() => void>();
    const notify = () => listeners.forEach((listener) => listener());
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    };

    let snapshot: Snapshot;
    let instance: ActorInstance | undefined;
    let release = () => {};
    /** How many times the app has started over, by a start or a Restore: an Instance reached in one run is stopped in the next. */
    let runs = 0;

    const mailbox = makeMailbox(
      time.now,
      (envelope) => {
        // Known before any Instance follows it, so what they start reads it:
        // a Restore put in place starts the app over, one refused changes nothing.
        const handled = instance!.receive(envelope, (handled) => {
          if (isRestore(envelope.message) && handled.outcome === 'handled')
            runs++;
          snapshot = handled.snapshot;
        });
        history.append(envelope, handled);
        return handled.outcome;
      },
      notify,
    );

    // 2. Send
    const send = (id: string, message: Tagged, source: Source): Sent => {
      if (!isRestore(message))
        actorAt(root, snapshot, id)?.check.message(
          message,
          `Message ${JSON.stringify(message._tag)}`,
        );
      return mailbox.send(id, message, source);
    };

    // 1. Start
    const go = Effect.gen(function* () {
      runs++;
      snapshot = yield* history.seek();
      time.start(history.branch().at(-1)?.at ?? 0);
      release = history.lock();
      mailbox.open();
      mailbox.hold(() => {
        instance = ActorInstance.start(
          root,
          snapshot,
          { send, now: time.now, services },
          scope,
        );
      });
      notify();
    });

    // 3. Stop
    const halt = Effect.suspend(() => {
      if (!instance) return Effect.void;
      const stopping = instance;
      instance = undefined;
      mailbox.close();
      time.stop();
      release();
      notify();
      return stopping.stop();
    });

    const restart = (from?: number | null) =>
      Effect.gen(function* () {
        yield* halt;
        if (from !== undefined) history.moveHead(from);
        yield* go;
      });

    /** A new start or stop interrupts the one still under way. */
    let current: Fiber.Fiber<void> | undefined;
    let closed = false;
    const latest = (effect: Effect.Effect<void>) =>
      Effect.suspend(() => {
        if (closed) return Effect.void;
        current?.interruptUnsafe();
        const fiber = Effect.runForkWith(services)(effect);
        current = fiber;
        return Fiber.join(fiber);
      });

    yield* go;
    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        closed = true;
        current?.interruptUnsafe();
        return halt;
      }),
    );

    /** Asks one of an Instance's Queries by name, for the live Instance that types it. */
    const query = (id: string, name: string, args: unknown) =>
      Effect.suspend(
        () =>
          instance?.query(id, name, args) ??
          Effect.fail(new Stopped({ instance: id, query: name })),
      );

    const running: Running<A> = {
      history,
      instance: ({ from }) =>
        reach<A>({ ...running, run: () => runs, query }, root, from),
      snapshot: () => snapshot,
      running: () => instance !== undefined,
      now: time.now,
      send: (id, message, source = { kind: 'outside' }) =>
        send(id, message, source),
      subscribe,
      changes: Stream.callback<Snapshot>(
        (queue) =>
          Effect.acquireRelease(
            Effect.sync(() => {
              Queue.offerUnsafe(queue, snapshot);
              return subscribe(() => void Queue.offerUnsafe(queue, snapshot));
            }),
            (unsubscribe) => Effect.sync(unsubscribe),
          ),
        { bufferSize: 1, strategy: 'sliding' },
      ),
      workers: (id) => instance?.workers(id) ?? [],
      provided: (id) => instance?.provided(id) ?? { top: [], state: [] },
      start: (from) => latest(restart(from)),
      stop: () => latest(halt),
    };
    return running;
  });

/** Runs an Actor, or carries a History on, until its Scope closes. */
export const Runtime = { start };
