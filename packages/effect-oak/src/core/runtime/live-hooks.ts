import { Context, Effect, Stream } from 'effect';
import type { Fiber } from 'effect';
import type { Definition, Tagged } from '../node/index.ts';
import type { Hooks, Instance } from '../tree/index.ts';
import { fork } from './effects.ts';

/** What the live app keeps for each Instance, beside the tree. */
type Work = {
  /** Services from above: the Layer's, plus what every ancestor Provides. */
  above: Context.Context<never>;
  /** What the Instance Provides in its current State. */
  provided: Context.Context<never>;
  lifetime: Fiber.Fiber<unknown> | undefined;
  readonly commands: Set<Fiber.Fiber<unknown>>;
};

/**
 * The Hooks that connect a tree to the outside world: as it changes, Services
 * are Provided, Lifetimes start and stop, and Commands run. `halt` interrupts
 * every Lifetime and Command in a tree at once.
 */
export const liveHooks = (
  layer: Context.Context<never>,
  send: Hooks['send'],
): Hooks & { readonly halt: (root: Instance) => void } => {
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
  const commands = (
    instance: Instance,
    effects: ReadonlyArray<unknown>,
    replace?: boolean,
  ) => {
    const work = workOf(instance);
    if (replace) stop(work);
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
  const stop = (work: Work) => {
    for (const fiber of work.commands) fiber.interruptUnsafe();
    work.commands.clear();
  };
  const destroyed = (instance: Instance) => stop(workOf(instance));

  const halt = (instance: Instance) => {
    const work = works.get(instance);
    if (work) {
      leaving(instance);
      stop(work);
    }
    for (const child of Object.values(instance.children)) halt(child);
  };

  return { send, entered, leaving, changed, commands, destroyed, halt };
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
