import { Effect } from 'effect';
import type {
  ActorOf,
  AnyActor,
  ChildAs,
  KidsIn,
  Only,
  QueriesIn,
  QueryAs,
  Tagged,
  Types,
} from '../actor/index.ts';
import type { ActorDefinition } from '../actor/engine/index.ts';
import { Address, Snapshot } from '../data/index.ts';
import type { From, Instance } from '../data/index.ts';
import { Stopped } from './live/index.ts';
import type { Sent, WorkerStatus } from './live/index.ts';

/*
 * Reaching the app from outside its tree: the root Instance, typed by its
 * Actor, and every Instance below it. Each one holds only its Address and
 * its Actor, and reads the rest from the Runtime's Snapshot whenever it is
 * read, so it is always live. One that has stopped, or was reached before
 * the app last started over by a Restore or a Fork, reads what it held
 * when last read. While the Runtime runs, it can Send, always from outside
 * under the name it was reached with, and ask the Queries its Actor answers
 * in its current State; it can wait `until` its data passes a test, and
 * change nothing else.
 */

/**
 * One live Instance, reached from outside the tree and narrowed by its
 * current State: `_tag` repeats the State's tag at the top so a check on it
 * narrows `state` and `children` together. Of no Actor in particular, it is
 * any Actor's, so a `Running<unknown>` takes every Runtime.
 */
export type LiveInstance<A> = [Types<A>] extends [never]
  ? LiveInstance<AnyActor>
  : Typed<A>;

type Typed<A> = {
  [T in Types<A>['state']['_tag']]: {
    readonly _tag: T;
    readonly address: Address<A>;
    /** Its key, if it is a keyed Child. */
    readonly key?: string;
    readonly model: Types<A>['model'];
    readonly state: Only<Types<A>['state'], T>;
    /** What its parent hands it now. */
    readonly props: Types<A>['props'];
    readonly children: {
      readonly [K in keyof KidsIn<A, T>]: ChildAs<
        KidsIn<A, T>[K],
        LiveInstance<ActorOf<KidsIn<A, T>[K]>>
      >;
    };
    /** What its Workers are doing now. Empty once it has stopped. */
    readonly workers: ReadonlyArray<WorkerStatus>;
    /**
     * The Queries it answers now: the ones written at its top, and the ones
     * of the State `_tag` narrows it to. Each fails with `Stopped` once it
     * has stopped or left that State, or while the Runtime is stopped.
     */
    readonly queries: {
      readonly [K in keyof QueriesIn<A, T>]: QueryAs<
        QueriesIn<A, T>[K],
        Stopped
      >;
    };
    /** Whether it has stopped, the app has started over by a Restore or a Fork since it was reached, or the Runtime was let go: nothing Sent to it arrives. Reach the app again after a Restore or a Fork. */
    readonly stopped: boolean;
    /**
     * Send it a Message from outside, and say what became of it: `handled`
     * by a rule, `ignored` with no rule for it in this State, `queued`
     * behind a Message being played, or `refused` once it has stopped,
     * while the Runtime is stopped, or when the Message does not match its
     * Schema.
     */
    send(message: Types<A>['message']): Sent;
    /**
     * Wait until its data passes `test`, read now and after every Message:
     * the Instance, narrowed as the test narrows it, or `Stopped` once it
     * has stopped first. Send, then wait `until` what the Message started is
     * done: the answer is read from data the History keeps.
     */
    until<N extends LiveInstance<A>>(
      test: (instance: LiveInstance<A>) => instance is N,
    ): Effect.Effect<N, Stopped>;
    until(
      test: (instance: LiveInstance<A>) => boolean,
    ): Effect.Effect<LiveInstance<A>, Stopped>;
  };
}[Types<A>['state']['_tag']];

/** A live Instance as it is built, before its Actor types it. */
interface Untyped {
  readonly _tag: string;
  readonly address: Address;
  readonly key?: string;
  readonly model: unknown;
  readonly state: Tagged;
  readonly props: unknown;
  readonly children: Readonly<Record<string, Untyped | ReadonlyArray<Untyped>>>;
  readonly workers: ReadonlyArray<WorkerStatus>;
  readonly queries: Readonly<
    Record<string, (args?: unknown) => Effect.Effect<unknown, unknown>>
  >;
  readonly stopped: boolean;
  send(message: Tagged): Sent;
  until(test: (instance: Untyped) => boolean): Effect.Effect<Untyped, Stopped>;
}

/** What reaching needs of a Runtime. */
export interface Reachable {
  /** The root Instance now. */
  readonly root: () => Instance;
  /** Whether the Runtime has been let go. */
  readonly gone: () => boolean;
  readonly send: (address: Address, message: Tagged, from: From) => Sent;
  /** Calls `listener` once the Mailbox is empty, and on every start, stop and Fork. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Calls `listener` right after each Message is handled, while the Mailbox drains. */
  readonly observe: (listener: () => void) => () => void;
  readonly workers: (address: Address) => ReadonlyArray<WorkerStatus>;
  readonly query: (
    address: Address,
    name: string,
    args: unknown,
  ) => Effect.Effect<unknown, unknown>;
  /** How many times the app has started over, by a Restore or a Fork. */
  readonly run: () => number;
}

/** The root Instance, live, Sending from outside under the name `from`. */
export const reach = <A extends AnyActor>(
  app: Reachable,
  root: ActorDefinition,
  from: string,
): LiveInstance<A> =>
  live(
    app,
    root,
    app.root(),
    { kind: 'outside', name: from },
    app.run(),
  ) as unknown as LiveInstance<A>;

const live = (
  app: Reachable,
  definition: ActorDefinition,
  first: Instance,
  from: From,
  run: number,
): Untyped => {
  const { address } = first;
  const key = Address.parse(address).path.at(-1)?.key;
  let last = first;
  const found = () =>
    app.run() === run
      ? Snapshot.at({ entry: null, root: app.root() }, address)
      : undefined;
  const now = () => (last = found() ?? last);
  const stopped = () => app.gone() || found() === undefined;

  const self: Untyped = {
    address,
    ...(key === undefined ? {} : { key }),
    get _tag() {
      return now().state._tag;
    },
    get model() {
      return now().model;
    },
    get state() {
      return now().state;
    },
    get props() {
      return now().props;
    },
    get children() {
      const { state, children } = now();
      const slots = definition.children[state._tag] ?? {};
      return Object.fromEntries(
        Object.entries(children).map(([slot, held]) => {
          const child = (instance: Instance) =>
            live(app, slots[slot]!.definition, instance, from, run);
          return [slot, Snapshot.isMany(held) ? held.map(child) : child(held)];
        }),
      );
    },
    get workers() {
      return stopped() ? [] : app.workers(address);
    },
    get queries() {
      const tag = now().state._tag;
      return Object.fromEntries(
        Object.entries(definition.queries)
          .filter(
            ([, query]) => query.state === undefined || query.state === tag,
          )
          .map(([name]) => [
            name,
            (args?: unknown) =>
              Effect.suspend(() =>
                stopped()
                  ? Effect.fail(new Stopped({ instance: address, query: name }))
                  : app.query(address, name, args),
              ),
          ]),
      );
    },
    get stopped() {
      return stopped();
    },
    send: (message: Tagged) => {
      if (stopped()) return 'refused';
      try {
        definition.check.message(
          message,
          `Message ${JSON.stringify(message._tag)}`,
        );
      } catch {
        return 'refused';
      }
      return app.send(address, message, from);
    },
    until: (test) =>
      Effect.callback<Untyped, Stopped>((resume) => {
        let done = false;
        const leave: Array<() => void> = [];
        const finish = (exit: Effect.Effect<Untyped, Stopped>) => {
          done = true;
          leave.forEach((unsubscribe) => unsubscribe());
          resume(exit);
        };
        /**
         * Settles once the test passes or the Instance has stopped. A test
         * that throws ends the wait with a defect, never reaching the
         * Runtime that called it.
         */
        const check = () => {
          if (done) return;
          if (stopped())
            return finish(Effect.fail(new Stopped({ instance: address })));
          let passed: boolean;
          try {
            passed = test(self);
          } catch (error) {
            return finish(Effect.die(error));
          }
          if (passed) finish(Effect.succeed(self));
        };
        check();
        if (done) return;
        // After every Message, so a State one Message enters and the next
        // leaves is seen; and when the Runtime is let go, which no Message makes.
        leave.push(app.observe(check), app.subscribe(check));
        return Effect.sync(() => leave.forEach((unsubscribe) => unsubscribe()));
      }),
  };
  return self;
};
