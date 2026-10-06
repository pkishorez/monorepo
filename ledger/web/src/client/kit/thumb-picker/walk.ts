import { type Choice, idsAlong, listsAlong, opens } from './tree.ts';

/**
 * How far, in px, the finger goes: to show the walk, and for each move, a
 * Step, opening or going back.
 */
export type Distances = { readonly reveal: number; readonly step: number };

/** The distances a walk keeps unless told others. */
export const DISTANCES: Distances = { reveal: 14, step: 30 };

/** Where the moving finger is, in px from where it landed. */
export type Point = { readonly x: number; readonly y: number };

/** A way the finger moves. */
type Way = 'up' | 'down' | 'left' | 'right';

/**
 * A swipe's way through the tree: the choice marked in each list opened,
 * where the finger last moved something, the choice each list had marked
 * as it was left, the way a push last went wrong, and whether it shows.
 */
export type Walk = {
  readonly path: ReadonlyArray<number>;
  readonly anchor: Point;
  readonly memory: ReadonlyMap<string, number>;
  readonly wrong: Way | undefined;
  readonly shown: boolean;
};

/** What a move did: Stepped, opened a choice, went back, or went wrong. */
export type Event = 'step' | 'open' | 'back' | 'wrong';

/** A walk starting on the top-level choice `start` names, else the first. */
export const begin = (
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
): Walk => ({
  path: [
    Math.max(
      0,
      tree.findIndex((choice) => choice.id === start[0]),
    ),
  ],
  anchor: { x: 0, y: 0 },
  memory: new Map(),
  wrong: undefined,
  shown: false,
});

// Which child a list opens on: the one marked when it was last left in
// this swipe, else the one on the way to where the swipe began, else the
// first.
const openingOf = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
  children: ReadonlyArray<Choice>,
) => {
  const ids = idsAlong(tree, walk.path);
  const remembered = walk.memory.get(ids.join('/'));
  if (remembered !== undefined) return remembered;
  const onStart = ids.every((id, depth) => id === start[depth]);
  const here = children.findIndex((child) => child.id === start[ids.length]);
  return onStart && here >= 0 ? here : 0;
};

// The path one move `way` takes it to, or undefined where it leads nowhere;
// memory holds what a list had marked as it was left.
const stepped = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
  way: Way,
): Pick<Walk, 'path' | 'memory'> | undefined => {
  const { path, memory } = walk;
  const lists = listsAlong(tree, path);
  const depth = path.length - 1;
  const list = lists[depth] ?? [];
  const at = path[depth] ?? 0;
  if (way === 'up' || way === 'down') {
    const next = at + (way === 'down' ? 1 : -1);
    if (next < 0 || next >= list.length) return undefined;
    return { path: [...path.slice(0, depth), next], memory };
  }
  if (way === 'right') {
    const marked = list[at];
    if (!opens(marked)) return undefined;
    const child = openingOf(walk, tree, start, marked?.children ?? []);
    return { path: [...path, child], memory };
  }
  if (depth === 0) return undefined;
  const left = new Map(memory);
  left.set(idsAlong(tree, path.slice(0, -1)).join('/'), at);
  return { path: path.slice(0, -1), memory: left };
};

const EVENTS: Readonly<Record<Way, Exclude<Event, 'wrong'>>> = {
  up: 'step',
  down: 'step',
  right: 'open',
  left: 'back',
};

/**
 * The walk after the finger moves to `finger`. Each `step` px it goes from
 * where it last moved something, up or down or sideways, whichever is
 * more, makes one move: a Step, opening the marked choice, or going back.
 * Where a move leads nowhere, past an end or sideways with nothing to open
 * or go back to, where it counts from follows the finger, so turning
 * around counts from where it turned; a sideways push there is wrong once.
 * It shows once the finger is `reveal` px from where it landed, or with
 * the first move. Each move made, and each wrong, is told.
 */
export const move = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
  finger: Point,
  { reveal, step }: Distances = DISTANCES,
): { readonly walk: Walk; readonly events: ReadonlyArray<Event> } => {
  let next =
    walk.shown || Math.hypot(finger.x, finger.y) < reveal
      ? walk
      : { ...walk, shown: true };
  const events: Array<Event> = [];
  for (;;) {
    const dx = finger.x - next.anchor.x;
    const dy = finger.y - next.anchor.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < step) break;
    const sideways = Math.abs(dx) > Math.abs(dy);
    const way: Way = sideways
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
        ? 'down'
        : 'up';
    const moved = stepped(next, tree, start, way);
    if (moved === undefined) {
      const anchor = sideways
        ? { x: finger.x, y: next.anchor.y }
        : { x: next.anchor.x, y: finger.y };
      if (sideways && next.wrong !== way) events.push('wrong');
      next = { ...next, anchor, wrong: sideways ? way : next.wrong };
      continue;
    }
    // Only the way it went counts on; the other starts over from here.
    const anchor = sideways
      ? { x: next.anchor.x + Math.sign(dx) * step, y: finger.y }
      : { x: finger.x, y: next.anchor.y + Math.sign(dy) * step };
    next = { ...moved, anchor, wrong: undefined, shown: true };
    events.push(EVENTS[way]);
  }
  return { walk: next, events };
};

/**
 * The choice lifting chooses: the marked one, unless it is where the swipe began or on the way to it.
 */
export const chosen = (
  walk: Walk,
  tree: ReadonlyArray<Choice>,
  start: ReadonlyArray<string>,
): Choice | undefined => {
  const ids = idsAlong(tree, walk.path);
  if (ids.every((id, depth) => id === start[depth])) return undefined;
  const lists = listsAlong(tree, walk.path);
  return lists[lists.length - 1]?.[walk.path[walk.path.length - 1] ?? -1];
};
