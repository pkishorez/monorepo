import { Context, Deferred, Effect, Exit, Layer, Scope } from 'effect';
import type {
  ActorDefinition,
  ProvideDefinition,
  SlotDefinition,
} from '../../actor/index.ts';
import { isMany, within } from '../../snapshot/index.ts';
import type { Address, Instance } from '../../snapshot/index.ts';
import { runCommands } from './errand.ts';
import { Asked, ask, Stopped } from './query.ts';
import { dataOf, forkIn, makeOwn } from './host.ts';
import type { Host, Own, Services } from './host.ts';
import { makeWorkers } from './worker.ts';
import type { WorkerStatus } from './worker.ts';

/*
 * A live Instance: one Instance of the Snapshot, made real in Effect. It
 * holds no data of its own and decides nothing. It is told its node of the
 * Snapshot, and runs the work that node asks for:
 *
 *   Instance scope            lives as long as the Instance
 *   ├── its data              what its code reads as Self
 *   ├── its Provides
 *   ├── its Workers           each for as long as its Condition holds
 *   ├── Children written at the top
 *   └── State scope           lives as long as the current State
 *       ├── the State's Provides
 *       └── Children written in that State
 *
 * 1. Start   open its Scope inside its parent's, then its data, its
 *            Provides, its Workers, its top Children and its State.
 * 2. Follow  its next node. The same object: nothing to do, here or below.
 *            A new State: close the old State's Scope and open the new
 *            one. New data: hand it to Self, and start and stop Workers by
 *            their Conditions. Children: stop the ones gone, start the new
 *            ones, and have the rest follow theirs.
 * 3. Stop    close its Scope: everything in it ends, Children first.
 *
 * Asked a Query, it answers from where it is now, and cancels every Query
 * being answered at a level when that level ends: a State's when it is
 * left, the Instance's when it stops. A level that ends cancels the Queries
 * of every Instance below it too, before any Scope closes.
 */

/** The whole tree, alive: what the Runtime starts, tells every Snapshot after, and stops. */
export interface LiveTree {
  /** Follow the next tree, from the root down. */
  readonly follow: (root: Instance) => void;
  /** Run Commands an Update asked for, in the Instance it was for. */
  readonly command: (
    address: Address,
    commands: ReadonlyArray<unknown>,
  ) => void;
  readonly workers: (address: Address) => ReadonlyArray<WorkerStatus>;
  /** Ask one of an Instance's Queries by name; `Stopped` for an Instance that is gone or a Query not askable now. */
  readonly query: (
    address: Address,
    name: string,
    args: unknown,
  ) => Effect.Effect<unknown, unknown>;
  readonly stop: () => Effect.Effect<void>;
}

/** What an Instance's own code reads; a change to any of it reaches its Self and its Workers. */
const DATA = ['model', 'state', 'props'] as const;

/** Where Children hang: the Scope they live in and the Capabilities they get. */
interface Place {
  readonly scope: Scope.Scope;
  readonly services: Services;
}

/** One live Instance, as its parent holds it. */
interface Live {
  readonly follow: (next: Instance) => void;
  readonly find: (address: string) => Live | undefined;
  readonly command: (commands: ReadonlyArray<unknown>) => void;
  readonly workers: () => ReadonlyArray<WorkerStatus>;
  readonly query: (
    name: string,
    args: unknown,
  ) => Effect.Effect<unknown, unknown>;
  /** Cancels every Query being answered here and anywhere below. */
  readonly cancel: () => void;
  readonly stop: () => Effect.Effect<void>;
}

// 1. Start
const start = (
  host: Host,
  definition: ActorDefinition,
  instance: Instance,
  parent: Place,
): Live => {
  const own = makeOwn(instance, host, parent.services);
  const inside = open(host, parent, definition.provides, own);
  const asked = new Asked();
  const workers = makeWorkers(definition.workers, own, inside.scope);
  workers.sync(dataOf(instance));
  const top = startChildren(
    host,
    slotsAt(definition, instance, 'top'),
    instance,
    inside,
  );

  /** A State lasts while the Instance is in it: a Scope inside the Instance's, what it Provides, and its Children. */
  const enter = (instance: Instance) => {
    const place = open(
      host,
      inside,
      definition.stateProvides[instance.state._tag],
      own,
    );
    const asked = new Asked();
    const children = startChildren(
      host,
      slotsAt(definition, instance, 'state'),
      instance,
      place,
    );
    const cancel = () => {
      asked.cancel();
      children.cancel();
    };
    return {
      children,
      asked,
      cancel,
      leave: () => {
        cancel();
        Effect.runFork(Scope.close(place.scope, Exit.void));
      },
    };
  };
  let state = enter(instance);
  let current = instance;

  // 2. Follow
  const follow = (next: Instance) => {
    if (next === current) return;
    const before = current;
    current = next;
    const entered = before.state._tag !== next.state._tag;
    if (entered) state.leave();
    if (DATA.some((field) => before[field] !== next[field])) {
      own.set(next);
      workers.sync(dataOf(next));
    }
    if (entered) state = enter(next);
    else state.children.follow(next);
    top.follow(next);
  };

  const live: Live = {
    follow,
    find: (address) =>
      address === instance.address
        ? live
        : (top.find(address) ?? state.children.find(address)),
    command: (commands) => runCommands(commands, own, inside.scope),
    workers: workers.statuses,
    query: (name, args) =>
      Effect.suspend(() => {
        const query = definition.queries[name];
        if (!query)
          return Effect.die(
            new Error(
              `[@kestack/kabuki] ${definition.name} has no Query "${name}"`,
            ),
          );
        const at = query.state === undefined ? [asked] : [asked, state.asked];
        return ask(own, query, name, args, current.state, at);
      }),
    cancel: () => {
      asked.cancel();
      top.cancel();
      state.cancel();
    },
    // 3. Stop
    stop: () =>
      Effect.suspend(() => {
        live.cancel();
        return Scope.close(inside.scope, Exit.void);
      }),
  };
  return live;
};

/**
 * A Scope inside `outer`, and the Capabilities below it: the ones from
 * above, with the ones Provided there over them. Only the Capabilities
 * the level names reach below, whatever else its Layer builds.
 */
const open = (
  host: Host,
  outer: Place,
  provide: ProvideDefinition | undefined,
  own: Own,
): Place & { readonly scope: Scope.Closeable } => {
  const scope = Scope.forkUnsafe(outer.scope);
  if (!provide) return { scope, services: outer.services };
  const services = Deferred.makeUnsafe<Context.Context<never>>();
  forkIn(
    host,
    scope,
    `${own.address} provides`,
    Deferred.await(outer.services).pipe(
      Effect.flatMap((above) =>
        Layer.buildWithScope(
          provide.layer(own.self) as Layer.Layer<never>,
          scope,
        ).pipe(
          Effect.provideContext(above),
          Effect.map((built) =>
            Context.merge(above, Context.pick(...provide.capabilities)(built)),
          ),
        ),
      ),
      Effect.flatMap((below) => Deferred.succeed(services, below)),
    ),
  );
  return { scope, services };
};

/** The Children held in some slots, alive in one Place: they start, follow and stop as the parent's node says. */
const startChildren = (
  host: Host,
  slots: Readonly<Record<string, SlotDefinition>>,
  parent: Instance,
  place: Place,
) => {
  const alive = new Map<string, Live>();
  const held = (parent: Instance) =>
    Object.keys(slots).flatMap((slot) => {
      const kids = parent.children[slot];
      const all = !kids ? [] : isMany(kids) ? kids : [kids];
      return all.map((kid) => ({ kid, definition: slots[slot]!.definition }));
    });
  const add = ({ kid, definition }: ReturnType<typeof held>[number]) =>
    alive.set(kid.address, start(host, definition, kid, place));
  held(parent).forEach(add);

  return {
    follow: (parent: Instance) => {
      const next = held(parent);
      const kept = new Set<string>(next.map(({ kid }) => kid.address));
      for (const [address, gone] of alive)
        if (!kept.has(address)) {
          alive.delete(address);
          Effect.runFork(gone.stop());
        }
      for (const each of next) {
        const known = alive.get(each.kid.address);
        if (known) known.follow(each.kid);
        else add(each);
      }
    },
    find: (address: string) =>
      [...alive].find(([kid]) => within(kid, address))?.[1].find(address),
    cancel: () => alive.forEach((kid) => kid.cancel()),
  };
};

/** The slots of an Instance's current State written at its top, or in the State itself. */
const slotsAt = (
  definition: ActorDefinition,
  instance: Instance,
  where: 'top' | 'state',
) =>
  Object.fromEntries(
    Object.entries(definition.children[instance.state._tag] ?? {}).filter(
      ([slot]) => definition.lasting.includes(slot) === (where === 'top'),
    ),
  );

/** Start the whole tree from its root's node, in the Runtime's Scope and with the app's Capabilities. */
const startTree = (
  definition: ActorDefinition,
  root: Instance,
  host: Host,
  scope: Scope.Scope,
  services: Services,
): LiveTree => {
  const live = start(host, definition, root, { scope, services });
  return {
    follow: live.follow,
    command: (address, commands) => {
      if (commands.length > 0) live.find(address)?.command(commands);
    },
    workers: (address) => live.find(address)?.workers() ?? [],
    query: (address, name, args) =>
      Effect.suspend(
        () =>
          live.find(address)?.query(name, args) ??
          Effect.fail(new Stopped({ instance: address, query: name })),
      ),
    stop: live.stop,
  };
};

export const LiveTree = { start: startTree };
