import { Context, Deferred, Effect, Exit, Layer, Scope } from 'effect';
import type { ActorDefinition, SlotDefinition } from '../../actor/index.ts';
import { handle, isMany, within } from '../../snapshot/index.ts';
import type {
  Envelope,
  Handled,
  Instance,
  Snapshot,
} from '../../snapshot/index.ts';
import { runCommands } from './command.ts';
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
 * A State lasts while its Instance is in it: a Scope inside the Instance's,
 * what the State Provides, and the Children written in it.
 */

export interface ActorInstance {
  readonly receive: (envelope: Envelope) => Handled;
  readonly workers: (instance: string) => ReadonlyArray<WorkerStatus>;
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
  readonly find: (id: string) => Living | undefined;
  readonly command: (commands: ReadonlyArray<unknown>) => void;
  readonly workers: () => ReadonlyArray<WorkerStatus>;
  readonly stop: () => Effect.Effect<void>;
}

const start = (
  definition: ActorDefinition,
  snapshot: Snapshot,
  host: Host,
  scope: Scope.Scope,
): ActorInstance => {
  const services = Deferred.makeUnsafe<Context.Context<never>>();
  Deferred.doneUnsafe(services, Effect.succeed(host.services));
  const root = live(definition, snapshot, host, { scope, services });
  let current = snapshot;

  return {
    // 2. Receive
    receive: (envelope) => {
      const handled = handle(definition, current, envelope);
      current = handled.snapshot;
      root.follow(current);
      root.find(envelope.destination)?.command(handled.commands);
      return handled;
    },
    workers: (id) => root.find(id)?.workers() ?? [],
    stop: root.stop,
  };
};

// 1. Start
const live = (
  definition: ActorDefinition,
  instance: Instance,
  host: Host,
  parent: Place,
): Living => {
  const scope = Scope.forkUnsafe(parent.scope);
  const own = makeOwn(instance, host, parent.services);
  const inside: Place = {
    scope,
    services: provided(parent.services, scope, definition.provides, own, host),
  };
  const workers = makeWorkers(definition.workers, own, scope);
  workers.sync(dataOf(instance));
  const top = children(
    slotsAt(definition, instance, 'top'),
    instance,
    inside,
    host,
  );
  let state = State.start(definition, instance, own, inside, host);
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
    if (entered) state = State.start(definition, next, own, inside, host);
    else state.children.follow(next);
    top.follow(next);
  };

  const living: Living = {
    follow,
    find: (id) =>
      id === instance.id ? living : (top.find(id) ?? state.children.find(id)),
    command: (commands) => runCommands(commands, own, scope),
    workers: workers.statuses,
    // 4. Stop
    stop: () => Scope.close(scope, Exit.void),
  };
  return living;
};

const State = {
  start: (
    definition: ActorDefinition,
    instance: Instance,
    own: Own,
    inside: Place,
    host: Host,
  ) => {
    const scope = Scope.forkUnsafe(inside.scope);
    const provides = definition.stateProvides[instance.state._tag];
    const place: Place = {
      scope,
      services: provided(inside.services, scope, provides, own, host),
    };
    return {
      children: children(
        slotsAt(definition, instance, 'state'),
        instance,
        place,
        host,
      ),
      stop: () => Effect.runFork(Scope.close(scope, Exit.void)),
    };
  },
};

/** The Capabilities below what an Instance or its State Provides: the ones from above, with it built over them. */
const provided = (
  above: Services,
  scope: Scope.Scope,
  provide: Function | undefined,
  own: Own,
  host: Host,
): Services => {
  if (!provide) return above;
  const below = Deferred.makeUnsafe<Context.Context<never>>();
  forkIn(
    host,
    scope,
    `${own.self.id} provides`,
    Deferred.await(above).pipe(
      Effect.flatMap((services) =>
        Layer.buildWithScope(
          provide(own.self) as Layer.Layer<never>,
          scope,
        ).pipe(
          Effect.provideContext(services),
          Effect.map((built) => Context.merge(services, built)),
        ),
      ),
      Effect.flatMap((services) => Deferred.succeed(below, services)),
    ),
  );
  return below;
};

/** The Children held in some slots, alive in one Place: they start, follow and stop as the slots change. */
const children = (
  slots: Readonly<Record<string, SlotDefinition>>,
  instance: Instance,
  place: Place,
  host: Host,
) => {
  const alive = new Map<string, Living>();
  const held = (parent: Instance) =>
    Object.keys(slots).flatMap((slot) => {
      const kids = parent.children[slot];
      const all = !kids ? [] : isMany(kids) ? kids : [kids];
      return all.map((kid) => ({ kid, definition: slots[slot]!.definition }));
    });
  const add = ({ kid, definition }: ReturnType<typeof held>[number]) =>
    alive.set(kid.id, live(definition, kid, host, place));
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
