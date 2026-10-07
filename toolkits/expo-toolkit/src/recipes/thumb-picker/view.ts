import { TreeWalk } from '@kstackz/use-gesture';
import type { Choice } from './choice';

/**
 * A choice as the UI thread walks it: only its id and the choices inside.
 * Names, icons and what choosing does stay on the JS thread.
 */
export type Shape = {
  readonly id: string;
  readonly children?: ReadonlyArray<Shape>;
};

/** The shape of `tree`, to hand to the UI thread. */
export const shapeOf = (tree: ReadonlyArray<Choice>): ReadonlyArray<Shape> =>
  tree.map((choice) =>
    choice.children === undefined
      ? { id: choice.id }
      : { id: choice.id, children: shapeOf(choice.children) },
  );

/**
 * What the menu shows now, as plain data the UI thread writes and the
 * menu's lists read in the same frame: whether it shows, and each open list
 * by id with its marked row, from the top.
 */
export type View = {
  readonly shown: boolean;
  readonly open: ReadonlyArray<{
    readonly id: string;
    readonly marked: number;
  }>;
};

export const HIDDEN: View = { shown: false, open: [] };

/**
 * What the menu shows for `walk`, after `before`: the walk's open lists.
 * Once the walk is over it hides, keeping its lists where they were as it
 * fades.
 */
export const viewOf = (
  walk: TreeWalk.Walk | undefined,
  tree: ReadonlyArray<Shape>,
  start: ReadonlyArray<string>,
  before: View,
): View => {
  'worklet';
  if (walk === undefined) return { ...before, shown: false };
  return {
    shown: walk.shown,
    open: TreeWalk.columns(walk, tree, start).map((column) => ({
      id: column.id,
      marked: column.marked,
    })),
  };
};

/**
 * Where one list stands in `view`: how many open lists sit in front of it,
 * and its marked row; none when it is not open.
 */
export const placeIn = (view: View, id: string) => {
  'worklet';
  const at = view.open.findIndex((list) => list.id === id);
  const list = view.open[at];
  return list === undefined
    ? undefined
    : { back: view.open.length - 1 - at, marked: list.marked };
};
