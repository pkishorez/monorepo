import type {
  ActorDefinition,
  ActorOf,
  AnyActor,
  ChildAs,
  KidsIn,
  Only,
  Tagged,
  Types,
} from '../actor/index.ts';
import { instanceAt, isMany } from '../snapshot/index.ts';
import type { Instance, Snapshot, Source } from '../snapshot/index.ts';
import type { WorkerStatus } from './instance/index.ts';

/*
 * Reaching the app from outside its tree: the root Instance, typed by its
 * Actor, and every Instance below it. Each one holds only its ID and its
 * Actor, and reads the rest from the Runtime's Snapshot whenever it is read,
 * so it is always live. One that has stopped, or was reached before the
 * app last started over, by a start or a Restore, reads what it held when
 * last read. It can
 * Send, always from outside under the name it was reached with, and change
 * nothing else.
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
    readonly id: string;
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
    /** Whether it has stopped, or the app has started over since it was reached, by a start or a Restore: nothing Sent to it arrives. Reach the app again after either. */
    readonly stopped: boolean;
    /**
     * Send it a Message from outside: `true` once a live Instance has it, or
     * it waits its turn behind a Message being handled; `false` if it has
     * stopped or the Message does not match its Schema.
     */
    send(message: Types<A>['message']): boolean;
  };
}[Types<A>['state']['_tag']];

/** A live Instance as it is built, before its Actor types it. */
interface Untyped {
  readonly _tag: string;
  readonly id: string;
  readonly key?: string;
  readonly model: unknown;
  readonly state: Tagged;
  readonly props: unknown;
  readonly children: Readonly<Record<string, Untyped | ReadonlyArray<Untyped>>>;
  readonly workers: ReadonlyArray<WorkerStatus>;
  readonly stopped: boolean;
  send(message: Tagged): boolean;
}

/** What reaching needs of a Runtime. */
export interface Reachable {
  readonly snapshot: () => Snapshot;
  readonly running: () => boolean;
  readonly send: (id: string, message: Tagged, source: Source) => void;
  readonly workers: (id: string) => ReadonlyArray<WorkerStatus>;
  /** How many times the app has started over, by a start or a Restore. */
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
    app.snapshot(),
    { kind: 'outside', name: from },
    app.run(),
  ) as unknown as LiveInstance<A>;

const live = (
  app: Reachable,
  definition: ActorDefinition,
  first: Instance,
  source: Source,
  run: number,
): Untyped => {
  const { id } = first;
  let last = first;
  const found = () =>
    app.run() === run ? instanceAt(app.snapshot(), id) : undefined;
  const now = () => (last = found() ?? last);
  const stopped = () => !app.running() || found() === undefined;

  return {
    id,
    ...(first.key === undefined ? {} : { key: first.key }),
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
            live(app, slots[slot]!.definition, instance, source, run);
          return [slot, isMany(held) ? held.map(child) : child(held)];
        }),
      );
    },
    get workers() {
      return stopped() ? [] : app.workers(id);
    },
    get stopped() {
      return stopped();
    },
    send: (message: Tagged) => {
      if (stopped()) return false;
      try {
        definition.check.message(
          message,
          `Message ${JSON.stringify(message._tag)}`,
        );
      } catch {
        return false;
      }
      app.send(id, message, source);
      return true;
    },
  };
};
