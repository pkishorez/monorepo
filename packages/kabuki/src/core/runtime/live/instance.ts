import { Context, Deferred, Effect, Exit, Layer, Scope } from 'effect';
import type {
  ActorDefinition,
  ProvideDefinition,
  SlotDefinition,
} from '../../actor/engine/index.ts';
import { Address, Snapshot } from '../../data/index.ts';
import type { Instance } from '../../data/index.ts';
import { runCommands } from './errand.ts';
import { Asked, ask, Stopped } from './query.ts';
import { dataOf, forkIn, makeOwn } from './host.ts';
import type { Host, Own, Services } from './host.ts';
import { makeWorkers } from './worker.ts';
import type { WorkerStatus } from './worker.ts';

/*
 * The tree, alive: each Instance of the Snapshot made real in Effect, while
 * the Runtime runs. The Runtime starts it from the Snapshot it stands at,
 * tells it every Snapshot after, and stops it; the rest of every Instance's
 * life happens here.
 *
 * 1. Start    a Scope inside its parent's, its Self, what it Provides and the
 *             Children written at its top, its Workers, and its State.
 * 2. Follow   the next tree, from the root down: a new State stops the old
 *             one and starts the new; new data reaches its Self and its
 *             Workers; its Children follow theirs. Then the Runtime runs the
 *             Commands the Update asked for in the Instance it was for.
 * 3. Stop     close its Scope, and everything in it ends, Children first.
 *
 * Asked a Query, it answers from where it is now, and cancels every Query
 * being answered at a level when that level ends: a State's when it is
 * left, the Instance's when it stops, and all of them when a Restore starts
 * the app over. A level that ends cancels the Queries of every Instance
 * below it too, before any Scope closes.
 */

export interface LiveTree {
  /** Follow the next tree; `restarted` when a Restore put it in place, which cancels every Query. */
  readonly follow: (root: Instance, restarted: boolean) => void;
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

/** One living Instance, as its parent holds it. */
interface Living {
  readonly follow: (next: Instance) => void;
  readonly find: (address: string) => Living | undefined;
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

const start = (
  definition: ActorDefinition,
  first: Instance,
  host: Host,
  scope: Scope.Scope,
  services: Services,
): LiveTree => {
  // 1. Start
  const live = (
    definition: ActorDefinition,
    instance: Instance,
    parent: Place,
  ): Living => {
    const own = makeOwn(instance, host, parent.services);
    const inside = open(parent, definition.provides, own);
    const asked = new Asked();
    const workers = makeWorkers(definition.workers, own, inside.scope);
    workers.sync(dataOf(instance));
    const top = children(
      slotsAt(definition, instance, 'top'),
      instance,
      inside,
    );

    /** A State lasts while the Instance is in it: a Scope inside the Instance's, what it Provides, and its Children. */
    const enter = (instance: Instance) => {
      const place = open(
        inside,
        definition.stateProvides[instance.state._tag],
        own,
      );
      const asked = new Asked();
      const held = children(
        slotsAt(definition, instance, 'state'),
        instance,
        place,
      );
      const cancel = () => {
        asked.cancel();
        held.cancel();
      };
      return {
        children: held,
        place,
        asked,
        cancel,
        stop: () => {
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
      if (entered) state.stop();
      if (DATA.some((field) => before[field] !== next[field])) {
        own.set(next);
        workers.sync(dataOf(next));
      }
      if (entered) state = enter(next);
      else state.children.follow(next);
      top.follow(next);
    };

    const living: Living = {
      follow,
      find: (address) =>
        address === instance.address
          ? living
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
          const at =
            query.state === undefined
              ? [all, asked]
              : [all, asked, state.asked];
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
          living.cancel();
          return Scope.close(inside.scope, Exit.void);
        }),
    };
    return living;
  };

  /**
   * A Scope inside `outer`, and the Capabilities below it: the ones from
   * above, with the ones Provided there over them. Only the Capabilities
   * the level names reach below, whatever else its Layer builds.
   */
  const open = (
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
              Context.merge(
                above,
                Context.pick(...provide.capabilities)(built),
              ),
            ),
          ),
        ),
        Effect.flatMap((below) => Deferred.succeed(services, below)),
      ),
    );
    return { scope, services };
  };

  /** The Children held in some slots, alive in one Place: they start, follow and stop as the slots change. */
  const children = (
    slots: Readonly<Record<string, SlotDefinition>>,
    instance: Instance,
    place: Place,
  ) => {
    const alive = new Map<string, Living>();
    const held = (parent: Instance) =>
      Object.keys(slots).flatMap((slot) => {
        const kids = parent.children[slot];
        const all = !kids ? [] : Snapshot.isMany(kids) ? kids : [kids];
        return all.map((kid) => ({ kid, definition: slots[slot]!.definition }));
      });
    const add = ({ kid, definition }: ReturnType<typeof held>[number]) =>
      alive.set(kid.address, live(definition, kid, place));
    held(instance).forEach(add);

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
        [...alive]
          .find(([kid]) =>
            Address.within(kid as Address, address as Address),
          )?.[1]
          .find(address),
      cancel: () => alive.forEach((kid) => kid.cancel()),
    };
  };

  /** Every Query being answered anywhere in the tree: a Restore cancels them all. */
  const all = new Asked();
  const root = live(definition, first, { scope, services });

  return {
    follow: (next, restarted) => {
      if (restarted) all.cancel();
      root.follow(next);
    },
    command: (address, commands) => {
      if (commands.length > 0) root.find(address)?.command(commands);
    },
    workers: (address) => root.find(address)?.workers() ?? [],
    query: (address, name, args) =>
      Effect.suspend(
        () =>
          root.find(address)?.query(name, args) ??
          Effect.fail(new Stopped({ instance: address, query: name })),
      ),
    stop: root.stop,
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

export const LiveTree = { start };
