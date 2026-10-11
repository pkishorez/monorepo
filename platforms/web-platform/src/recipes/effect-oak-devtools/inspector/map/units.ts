import { isMany } from 'effect-oak';
import type { Definition, Instance, WorkerDefinition } from 'effect-oak';
import { keyLives } from '../../step/index.ts';
import type { Around, WorkerKey } from '../../step/index.ts';

/*
 * The Actors, with the Snapshots before and after a Step laid over them: one
 * Unit per Actor in the tree, each with a Group per State and the Units each
 * State Invokes; an Actor without States has one Group with no pill. Each
 * Worker belongs where its Condition is read: a State's to that Group, every
 * other to its Unit, with the keys the Snapshot expects after the Step and
 * the ones the Step stopped. Every Unit, Group and Worker carries how the
 * Step left it. Pure.
 */

export type Status = 'dim' | 'same' | 'changed' | 'started' | 'stopped';

/** One Worker an Actor can own, with the keys the Step expects of it. */
export interface WorkerUnit {
  readonly id: string;
  readonly name: string;
  readonly kind: WorkerDefinition['kind'];
  /**
   * The keys its Condition names after the Step, started or kept, then the
   * ones the Step stopped; `''` for every kind but `each`. Empty when it
   * should not run and did not before.
   */
  readonly keys: ReadonlyArray<WorkerKey>;
  readonly status: Status;
  /** The Instance it belongs to at this Step, to read what it is doing live. */
  readonly instance: string | undefined;
}

export interface Group {
  readonly id: string;
  /** `undefined` for an Actor without States, and the Instances under an opened keyed Child. */
  readonly tag: string | undefined;
  readonly status: Status;
  readonly units: ReadonlyArray<Unit>;
  /** The Workers owned by this State. */
  readonly workers: ReadonlyArray<WorkerUnit>;
  /** Whether its node is open, showing its Workers. */
  readonly open: boolean;
}

export interface Unit {
  readonly id: string;
  readonly actor: string;
  readonly instance: Instance | undefined;
  readonly status: Status;
  readonly many:
    | {
        readonly count: number;
        readonly open: boolean;
        /** Every Instance in it, before and after, by ID. */
        readonly members: ReadonlyArray<string>;
      }
    | undefined;
  readonly groups: ReadonlyArray<Group>;
  /** The Workers owned by the Instance, a yes or no, or a list of keys. */
  readonly workers: ReadonlyArray<WorkerUnit>;
  /** Whether its node is open, showing its Workers. */
  readonly open: boolean;
}

const WORKERS = '~workers';

/** The id under which an owner's Workers are opened, apart from a keyed Child's. */
export const workersId = (owner: string) => `${owner}${WORKERS}`;

/** Whether an opened id is an owner's Workers, not a keyed Child. */
export const opensWorkers = (id: string) => id.endsWith(WORKERS);

const statusOf = (
  was: Instance | undefined,
  is: Instance | undefined,
  fresh: boolean,
): Status =>
  !was && !is
    ? 'dim'
    : fresh || !was
      ? 'started'
      : !is
        ? 'stopped'
        : was.model !== is.model || was.state !== is.state
          ? 'changed'
          : 'same';

const held = (instance: Instance | undefined, slot: string) =>
  instance?.children[slot];

const NONE: ReadonlyArray<string> = [];

/** The keys a Worker's Condition names for an Instance's data, if it runs. */
const keysOf = (worker: WorkerDefinition, instance: Instance | undefined) =>
  instance
    ? worker.keys({ model: instance.model, state: instance.state })
    : NONE;

/** Dim with no keys, green when keys appear, red when they go, changed when the set moves. */
const workerStatus = (
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
  fresh: boolean,
): Status =>
  before.length === 0 && after.length === 0
    ? 'dim'
    : fresh || before.length === 0
      ? 'started'
      : after.length === 0
        ? 'stopped'
        : before.length === after.length &&
            before.every((key, at) => key === after[at])
          ? 'same'
          : 'changed';

/** The Workers of one owner: a State's (`state` given) or the Actor's own. */
const workersOf = (
  definition: Definition,
  id: string,
  was: Instance | undefined,
  is: Instance | undefined,
  fresh: boolean,
  state: string | undefined,
): ReadonlyArray<WorkerUnit> =>
  Object.entries(definition.workers)
    .filter(([, worker]) =>
      state === undefined
        ? worker.kind !== 'state'
        : worker.kind === 'state' && worker.state === state,
    )
    .map(([name, worker]) => {
      const before = keysOf(worker, was);
      const after = keysOf(worker, is);
      return {
        id: `${id}~${name}`,
        name,
        kind: worker.kind,
        keys: keyLives(before, after),
        status: workerStatus(before, after, fresh),
        instance: (is ?? was)?.id,
      };
    });

const build = (
  definition: Definition,
  id: string,
  was: Instance | undefined,
  is: Instance | undefined,
  fresh: boolean,
  open: ReadonlySet<string>,
  above: ReadonlySet<Definition>,
): Unit => {
  const status = statusOf(was, is, fresh);
  // An Actor inside itself is drawn once, unless Instances make it deeper.
  const recursive = above.has(definition) && !was && !is;
  const below = new Set(above).add(definition);
  // An Actor without States has one, which is not drawn.
  const single =
    definition.states.length === 1 && definition.states[0] === 'Single';
  const groups: Array<Group> = recursive
    ? []
    : definition.states.map((tag) => {
        const before = was?.state._tag === tag ? was : undefined;
        const after = is?.state._tag === tag ? is : undefined;
        const groupId = `${id}::${tag}`;
        const slots = Object.entries(definition.children[tag] ?? {});
        return {
          id: groupId,
          tag: single ? undefined : tag,
          status: statusOf(before, after, fresh && after !== undefined),
          workers: workersOf(definition, groupId, was, is, fresh, tag),
          open: open.has(workersId(groupId)),
          units: slots.map(([slot, child]): Unit => {
            const kidId = `${groupId}.${slot}`;
            const old = held(before, slot);
            const now = held(after, slot);
            if (!child.many)
              return build(
                child.definition,
                kidId,
                old && !isMany(old) ? old : undefined,
                now && !isMany(now) ? now : undefined,
                fresh,
                open,
                below,
              );
            const olds = old && isMany(old) ? old : [];
            const nows = now && isMany(now) ? now : [];
            const opened = open.has(kidId);
            return {
              id: kidId,
              actor: child.definition.name,
              instance: undefined,
              status:
                olds.length === 0 && nows.length === 0
                  ? 'dim'
                  : olds.length === 0
                    ? 'started'
                    : nows.length === 0
                      ? 'stopped'
                      : 'same',
              many: {
                count: nows.length,
                open: opened,
                members: [...olds, ...nows].map((kid) => kid.id),
              },
              workers: [],
              open: false,
              groups: opened
                ? [
                    {
                      id: `${kidId}::all`,
                      tag: undefined,
                      status: 'same',
                      workers: [],
                      open: false,
                      units: merged(olds, nows).map(([o, n]) =>
                        build(
                          child.definition,
                          (n ?? o)!.id,
                          o,
                          n,
                          fresh,
                          open,
                          below,
                        ),
                      ),
                    },
                  ]
                : [],
            };
          }),
        };
      });
  return {
    id,
    actor: definition.name,
    instance: is ?? was,
    status,
    many: undefined,
    groups,
    workers: recursive
      ? []
      : workersOf(definition, id, was, is, fresh, undefined),
    open: open.has(workersId(id)),
  };
};

/**
 * The Children before and after, in one order that moves as few as it can:
 * the old order, with stopped ones kept in place, and each new one after its
 * nearest older sibling and past any stopped ones that follow it.
 */
const merged = (
  before: ReadonlyArray<Instance>,
  after: ReadonlyArray<Instance>,
): Array<[Instance | undefined, Instance | undefined]> => {
  const now = new Map(after.map((kid) => [kid.id, kid]));
  const order: Array<[Instance | undefined, Instance | undefined]> = before.map(
    (old) => [old, now.get(old.id)],
  );
  const idOf = ([old, kid]: [Instance | undefined, Instance | undefined]) =>
    (kid ?? old)!.id;
  after.forEach((kid, index) => {
    if (order.some((pair) => idOf(pair) === kid.id)) return;
    let at = -1;
    for (let back = index - 1; back >= 0 && at === -1; back--)
      at = order.findIndex((pair) => idOf(pair) === after[back]!.id);
    let place = at + 1;
    if (at !== -1)
      while (place < order.length && order[place]![1] === undefined) place++;
    order.splice(place, 0, [undefined, kid]);
  });
  return order;
};

/** The root's Unit: every Actor below it, lit by the Step. */
export const unitsOf = (
  definition: Definition,
  { before, after }: Around,
  open: ReadonlySet<string>,
): Unit =>
  build(
    definition,
    after.id,
    before,
    after,
    before === undefined,
    open,
    new Set(),
  );
