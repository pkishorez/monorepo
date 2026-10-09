import { Context, Effect, Stream } from 'effect';
import type { Fiber, Scope } from 'effect';
import type { AnyNode, Definition, Tagged, Types } from '../node/index.ts';
import { destroy, handle, plant } from '../tree/index.ts';
import type { Entry, Handle, Hooks, Instance, Sent } from '../tree/index.ts';
import { fork } from './effects.ts';

/*
 * The live app: the tree, plus everything that touches the outside world.
 *
 * 1. Start      the root is created with the Services of the app's Layer.
 * 2. Messages   wait in a queue and are handled one at a time. Each one is
 *               kept twice: as Sent, all Replay needs, and as a Log entry,
 *               with what came of it and when.
 * 3. Hooks      as the tree changes, Services are Provided, Lifetimes start and
 *               stop, and Commands run.
 */

/** Services a Node's tree still needs from the app's Layer. */
export type Needs<N> = Types<N>['open'];

/** A started tree: its root, and every Message so far. */
export interface Running<N> {
  readonly root: Handle<N>;
  /** Every Message with what came of it and when. */
  readonly log: () => ReadonlyArray<Entry>;
  /** Every Message and the Instance it was sent to, in order: what Replay plays. */
  readonly sent: () => ReadonlyArray<Sent>;
  /** Called whenever a Message is handled. */
  readonly subscribe: (listener: () => void) => () => void;
}

// 1. Start ---------------------------------------------------------------------

/**
 * Start a Node as the root of a running app. Needs every Service the tree
 * still requires; closing the Scope stops every Command and Lifetime.
 */
const start = <N extends AnyNode>(
  node: N,
): Effect.Effect<Running<N>, never, Needs<N> | Scope.Scope> =>
  Effect.gen(function* () {
    const layer = (yield* Effect.context<Needs<N>>()) as Context.Context<never>;

    let sent: ReadonlyArray<Sent> = [];
    let log: ReadonlyArray<Entry> = [];
    const listeners = new Set<() => void>();
    const queue = makeQueue((entry) => {
      sent = [...sent, { id: entry.id, message: entry.message }];
      log = [...log, entry];
      for (const listener of listeners) listener();
    });

    const hooks = liveHooks(layer, queue.send);
    const root = queue.hold(() => plant(node, hooks));
    yield* Effect.addFinalizer(() => Effect.sync(() => destroy(root)));

    return {
      root: root as unknown as Handle<N>,
      log: () => log,
      sent: () => sent,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  });

/** The running app: the tree of Instances, the Log, and the work in flight. */
export const Runtime = { start };

// 2. Messages ------------------------------------------------------------------

/**
 * Messages are handled one at a time, in the order they were sent. A Message
 * sent while another is being handled (a Lifetime starting on entry, say)
 * waits its turn, so every Update sees a settled tree.
 */
const makeQueue = (record: (entry: Entry) => void) => {
  const waiting: Array<readonly [Instance, Tagged]> = [];
  let busy = false;

  const drain = () => {
    if (busy) return;
    busy = true;
    try {
      for (let next = waiting.shift(); next; next = waiting.shift()) {
        const [instance, message] = next;
        record({
          id: instance.id,
          path: instance.path,
          message,
          ...handle(instance, message),
          time: Date.now(),
        });
      }
    } finally {
      busy = false;
    }
  };

  return {
    send: (instance: Instance, message: Tagged) => {
      waiting.push([instance, message]);
      drain();
    },
    /** Run `f` without handling Messages, then handle what it sent. */
    hold: <A>(f: () => A): A => {
      busy = true;
      try {
        return f();
      } finally {
        busy = false;
        drain();
      }
    },
  };
};

// 3. Hooks ---------------------------------------------------------------------

/** What the live app keeps for each Instance, beside the tree. */
type Work = {
  /** Services from above: the Layer's, plus what every ancestor Provides. */
  above: Context.Context<never>;
  /** What the Instance Provides in its current State. */
  provided: Context.Context<never>;
  lifetime: Fiber.Fiber<unknown> | undefined;
  readonly commands: Set<Fiber.Fiber<unknown>>;
};

const liveHooks = (
  layer: Context.Context<never>,
  send: Hooks['send'],
): Hooks => {
  const works = new WeakMap<Instance, Work>();
  const workOf = (instance: Instance): Work => {
    let work = works.get(instance);
    if (!work) {
      work = {
        above: instance.parent ? below(workOf(instance.parent)) : layer,
        provided: Context.empty(),
        lifetime: undefined,
        commands: new Set(),
      };
      works.set(instance, work);
    }
    return work;
  };

  /** Provide this State's Services, then start its Lifetime. */
  const entered = (instance: Instance) => {
    const work = workOf(instance);
    work.provided = provide(instance, work);
    const lifetime = instance.node.lifetime[instance.state._tag];
    if (lifetime) {
      work.lifetime = fork(
        instance.path,
        work.above,
        Stream.runForEach(
          lifetime({ model: instance.model, state: instance.state }),
          (message: Tagged) => Effect.sync(() => instance.send(message)),
        ),
      );
    }
  };

  const leaving = (instance: Instance) => {
    const work = workOf(instance);
    work.lifetime?.interruptUnsafe();
    work.lifetime = undefined;
  };

  /** Same State, new data: Provide again, and hand the result down. */
  const changed = (instance: Instance) => {
    const work = workOf(instance);
    work.provided = provide(instance, work);
    handDown(instance, work);
  };

  const handDown = (instance: Instance, work: Work) => {
    for (const child of Object.values(instance.children)) {
      const childWork = workOf(child);
      childWork.above = below(work);
      childWork.provided = provide(child, childWork);
      handDown(child, childWork);
    }
  };

  /** Run each Command; a Message it ends with goes back to its Instance. */
  const commands = (instance: Instance, effects: ReadonlyArray<unknown>) => {
    const work = workOf(instance);
    for (const command of effects as ReadonlyArray<
      Effect.Effect<unknown, never, any>
    >) {
      const fiber = fork(
        instance.path,
        work.above,
        Effect.flatMap(command, (message) =>
          Effect.sync(() => {
            if (message !== undefined) instance.send(message as Tagged);
          }),
        ),
      );
      work.commands.add(fiber);
      fiber.addObserver(() => work.commands.delete(fiber));
    }
  };

  /** Stop whatever Commands are still running. */
  const destroyed = (instance: Instance) => {
    const work = workOf(instance);
    for (const fiber of work.commands) fiber.interruptUnsafe();
    work.commands.clear();
  };

  return { send, entered, leaving, changed, commands, destroyed };
};

const below = (work: Work): Context.Context<never> =>
  Context.merge(work.above, work.provided);

const provide = (instance: Instance, work: Work): Context.Context<never> =>
  instance.node.provides[instance.state._tag]?.({
    model: instance.model,
    state: instance.state,
    services: resolve(instance.node, work.above),
    send: instance.send,
  }) ?? Context.empty();

const resolve = (
  node: Definition,
  above: Context.Context<never>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(node.requires).map(([name, key]) => [
      name,
      Context.getUnsafe(above, key),
    ]),
  );
