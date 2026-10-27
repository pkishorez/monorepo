import { Context, Deferred, Effect, Exit, Layer, Scope } from 'effect';
import type { ActorDefinition, SlotDefinition } from '../../actor/index.ts';
import { handle, isMany, isRestore, within } from '../../snapshot/index.ts';
import type {
  Envelope,
  Handled,
  Instance,
  Snapshot,
} from '../../snapshot/index.ts';
import { runCommands } from './command.ts';
import { Asked, ask, Stopped } from './query.ts';
import { dataOf, forkIn, makeOwn } from './self.ts';
import type { Host, Own, Services } from './self.ts';
import { makeWorkers } from './worker.ts';
import type { WorkerStatus } from './worker.ts';

/*
 * An Instance, alive: its piece of the Snapshot, made real in Effect. The
 * Runtime starts the root, hands it every Message, and stops it; the rest of
 * every Instance's life happens here.
 *
 * 1. Start    a Scope inside its parent's, its Self, what it Provides and the
 *             Children written at its top, its Workers, and its State.
 * 2. Receive  a Message, at the root: decide the next Snapshot, follow it
 *             down the tree, then run the Commands the Update asked for.
 * 3. Follow   its next version: a new State stops the old one and starts the
 *             new; new data reaches its Self and its Workers; its Children
 *             follow theirs.
 * 4. Stop     close its Scope, and everything in it ends, Children first.
 *
 * Asked a Query, it answers from where it is now, and cancels every Query
 * being answered at a level when that level ends: a State's when it is
 * left, the Instance's when it stops, and all of them when a Restore starts
 * the app over. A level that ends cancels the Queries of every Instance
 * below it too, before any Scope closes.
 */

export interface ActorInstance {
  /** Handle an Envelope; `heard` is told what came of it before any Instance follows it. */
  readonly receive: (
    envelope: Envelope,
    heard?: (handled: Handled) => void,
  ) => Handled;
  readonly workers: (instance: string) => ReadonlyArray<WorkerStatus>;
  /** The Capabilities an Instance provides to everything under it now, by key: at its top, and in its State. */
  readonly provided: (instance: string) => Provided;
  /** Ask one of an Instance's Queries by name; `Stopped` for an Instance that is gone or a Query not askable now. */
  readonly query: (
    instance: string,
    name: string,
    args: unknown,
  ) => Effect.Effect<unknown, unknown>;
  readonly stop: () => Effect.Effect<void>;
}

/** What an Instance's own code reads; a change to any of it reaches its Self and its Workers. */
const DATA = ['model', 'state', 'props'] as const;

/** What an Instance provides, by Capability key: what its top built, and what its State built. */
export interface Provided {
  readonly top: ReadonlyArray<string>;
  readonly state: ReadonlyArray<string>;
}

const NOTHING: Provided = { top: [], state: [] };

/** Where Children hang: the Scope they live in and the Capabilities they get. */
interface Place {
  readonly scope: Scope.Scope;
  readonly services: Services;
  /** The keys built here, once built; none where nothing is Provided. */
  readonly built?: () => ReadonlyArray<string>;
}

/** One living Instance, as its parent holds it. */
interface Living {
  readonly follow: (next: Instance) => void;
  readonly find: (id: string) => Living | undefined;
  readonly command: (commands: ReadonlyArray<unknown>) => void;
  readonly workers: () => ReadonlyArray<WorkerStatus>;
  readonly provided: () => Provided;
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
  snapshot: Snapshot,
  host: Host,
  scope: Scope.Scope,
): ActorInstance => {
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

    // 3. Follow
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
      find: (id) =>
        id === instance.id ? living : (top.find(id) ?? state.children.find(id)),
      command: (commands) => runCommands(commands, own, inside.scope),
      workers: workers.statuses,
      provided: () => ({
        top: inside.built?.() ?? [],
        state: state.place.built?.() ?? [],
      }),
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
      // 4. Stop
      stop: () =>
        Effect.suspend(() => {
          living.cancel();
          return Scope.close(inside.scope, Exit.void);
        }),
    };
    return living;
  };

  /** A Scope inside `outer`, and the Capabilities below it: the ones from above, with what is Provided there built over them. */
  const open = (
    outer: Place,
    provide: Function | undefined,
    own: Own,
  ): Place & { readonly scope: Scope.Closeable } => {
    const scope = Scope.forkUnsafe(outer.scope);
    if (!provide) return { scope, services: outer.services };
    const services = Deferred.makeUnsafe<Context.Context<never>>();
    let keys: ReadonlyArray<string> = [];
    forkIn(
      host,
      scope,
      `${own.self.id} provides`,
      Deferred.await(outer.services).pipe(
        Effect.flatMap((above) =>
          Layer.buildWithScope(
            provide(own.self) as Layer.Layer<never>,
            scope,
          ).pipe(
            Effect.provideContext(above),
            Effect.map((built) => {
              // What the Layer gave, without the memo map building it adds.
              keys = [...built.mapUnsafe.keys()].filter(
                (key) => key !== Layer.CurrentMemoMap.key,
              );
              return Context.merge(above, built);
            }),
          ),
        ),
        Effect.flatMap((below) => Deferred.succeed(services, below)),
      ),
    );
    return { scope, services, built: () => keys };
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
        const all = !kids ? [] : isMany(kids) ? kids : [kids];
        return all.map((kid) => ({ kid, definition: slots[slot]!.definition }));
      });
    const add = ({ kid, definition }: ReturnType<typeof held>[number]) =>
      alive.set(kid.id, live(definition, kid, place));
    held(instance).forEach(add);

    return {
      follow: (parent: Instance) => {
        const next = held(parent);
        const kept = new Set(next.map(({ kid }) => kid.id));
        for (const [id, gone] of alive)
          if (!kept.has(id)) {
            alive.delete(id);
            Effect.runFork(gone.stop());
          }
        for (const each of next) {
          const known = alive.get(each.kid.id);
          if (known) known.follow(each.kid);
          else add(each);
        }
      },
      find: (id: string) =>
        [...alive].find(([kid]) => within(kid, id))?.[1].find(id),
      cancel: () => alive.forEach((kid) => kid.cancel()),
    };
  };

  /** Every Query being answered anywhere in the tree: a Restore cancels them all. */
  const all = new Asked();
  const services = Deferred.makeUnsafe<Context.Context<never>>();
  Deferred.doneUnsafe(services, Effect.succeed(host.services));
  const root = live(definition, snapshot, { scope, services });
  let current = snapshot;

  return {
    // 2. Receive
    receive: (envelope, heard) => {
      const handled = handle(definition, current, envelope);
      current = handled.snapshot;
      heard?.(handled);
      if (isRestore(envelope.message) && handled.outcome === 'handled')
        all.cancel();
      root.follow(current);
      root.find(envelope.destination)?.command(handled.commands);
      return handled;
    },
    workers: (id) => root.find(id)?.workers() ?? [],
    provided: (id) => root.find(id)?.provided() ?? NOTHING,
    query: (id, name, args) =>
      Effect.suspend(
        () =>
          root.find(id)?.query(name, args) ??
          Effect.fail(new Stopped({ instance: id, query: name })),
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

export const ActorInstance = { start };
