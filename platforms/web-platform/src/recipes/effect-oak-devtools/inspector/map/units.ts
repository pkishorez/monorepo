import { isMany } from 'effect-oak';
import type { Definition, Instance } from 'effect-oak';
import type { Around } from '../../step/index.ts';

/*
 * The Actors, with the Snapshots before and after a Step laid over them: one
 * Unit per Actor in the tree, each with a Group per State and the Units each
 * State Invokes; an Actor without States has one Group with no pill. Every Unit and Group carries how the Step left it. Pure.
 */

export type Status = 'dim' | 'same' | 'changed' | 'started' | 'stopped';

export interface Group {
  readonly id: string;
  /** `undefined` for an Actor without States, and the Instances under an opened keyed Child. */
  readonly tag: string | undefined;
  readonly status: Status;
  readonly units: ReadonlyArray<Unit>;
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
}

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
              groups: opened
                ? [
                    {
                      id: `${kidId}::all`,
                      tag: undefined,
                      status: 'same',
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
