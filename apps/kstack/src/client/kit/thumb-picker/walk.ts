import { clamp, stepsOf } from './steps.ts';
import { type Choice, idsAlong, listsAlong, opens } from './tree.ts';

/** How far, in px, the finger goes up or down for the first Step. */
export const FIRST = 40;
/** How far, in px, the finger goes sideways to open a choice or go back. */
export const SIDE = 40;

/** Where the moving finger is, in px from where it landed. */
export type Point = { readonly x: number; readonly y: number };

// One list on the way down: the choice marked in it, the one its Steps
// count from, and where the finger was as they began counting.
type Level = {
  readonly at: number;
  readonly from: number;
  readonly origin: Point;
};

/**
 * A swipe's way through the tree: one Level per list opened, where the
 * marked choice last changed, the choice each list had marked as it was
 * left, and whether a sideways move has already gone wrong.
 */
export type Walk = {
  readonly levels: ReadonlyArray<Level>;
  readonly anchor: Point;
  readonly memory: ReadonlyMap<string, number>;
  readonly wrong: boolean;
};

/** What a move did: Stepped, opened a choice, went back, or went wrong. */
export type Event = 'step' | 'open' | 'back' | 'wrong';

const ORIGIN: Point = { x: 0, y: 0 };

/** The marked choice of each list, top to bottom. */
export const pathOf = (walk: Walk) => walk.levels.map((level) => level.at);

/** A walk starting on the top-level choice `start` names, else the first. */
export const begin = (
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
): Walk => {
  const at = Math.max(
    0,
    tree.findIndex((choice) => choice.id === start[0]),
  );
  return {
    levels: [{ at, from: at, origin: ORIGIN }],
    anchor: ORIGIN,
    memory: new Map(),
    wrong: false,
  };
};

// Which child a list opens on: the one marked when it was last left in
// this swipe, else the one on the way to where the swipe began, else the
// first.
const openingOf = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
  children: ReadonlyArray<Choice>,
) => {
  const ids = idsAlong(tree, pathOf(walk));
  const remembered = walk.memory.get(ids.join('/'));
  if (remembered !== undefined) return remembered;
  const onStart = ids.every((id, depth) => id === start[depth]);
  const here = children.findIndex((child) => child.id === start[ids.length]);
  return onStart && here >= 0 ? here : 0;
};

/**
 * The walk after the finger moves to `finger`. Sideways, past SIDE and
 * more than up or down since the marked choice last changed, opens the
 * marked choice or goes back to the list it is in; where there is nothing
 * to open or nothing to go back to, it is wrong, once, until the finger
 * comes back. Otherwise the travel up or down Steps through the list,
 * counted from where it began counting there.
 */
export const move = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
  finger: Point,
): { readonly walk: Walk; readonly event?: Event } => {
  const path = pathOf(walk);
  const lists = listsAlong(tree, path);
  const depth = walk.levels.length - 1;
  const level = walk.levels[depth];
  const list = lists[depth];
  if (level === undefined || list === undefined) return { walk };

  const side = finger.x - walk.anchor.x;
  const rise = Math.abs(finger.y - walk.anchor.y);
  const settled =
    walk.wrong && Math.abs(side) < SIDE / 2 ? { ...walk, wrong: false } : walk;
  const wrong = () =>
    settled.wrong
      ? { walk: settled }
      : { walk: { ...settled, wrong: true }, event: 'wrong' as const };

  if (side >= SIDE && side > rise) {
    const marked = list[level.at];
    if (!opens(marked)) return wrong();
    const at = openingOf(walk, tree, start, marked?.children ?? []);
    return {
      walk: {
        ...settled,
        levels: [...walk.levels, { at, from: at, origin: finger }],
        anchor: finger,
        wrong: false,
      },
      event: 'open',
    };
  }

  if (side <= -SIDE && -side > rise) {
    const parent = walk.levels[depth - 1];
    if (parent === undefined) return wrong();
    const memory = new Map(walk.memory);
    memory.set(idsAlong(tree, path.slice(0, -1)).join('/'), level.at);
    return {
      walk: {
        levels: [
          ...walk.levels.slice(0, depth - 1),
          { at: parent.at, from: parent.at, origin: finger },
        ],
        anchor: finger,
        memory,
        wrong: false,
      },
      event: 'back',
    };
  }

  const at = clamp(
    list.length,
    level.from + stepsOf(finger.y - level.origin.y, FIRST),
  );
  if (at === level.at) return { walk: settled };
  return {
    walk: {
      ...settled,
      levels: [...walk.levels.slice(0, depth), { ...level, at }],
      anchor: finger,
    },
    event: 'step',
  };
};

/**
 * The choice lifting chooses: the marked one, unless it is where the swipe
 * began or on the way to it.
 */
export const chosen = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
): Choice | undefined => {
  const path = pathOf(walk);
  const ids = idsAlong(tree, path);
  if (ids.every((id, depth) => id === start[depth])) return undefined;
  const lists = listsAlong(tree, path);
  return lists[lists.length - 1]?.[path[path.length - 1] ?? -1];
};
