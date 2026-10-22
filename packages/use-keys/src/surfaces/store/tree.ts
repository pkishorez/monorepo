import type { FlatSurface } from '../definition/index.ts';

/** The keys tree: every Surface by name, as the definition nests them. */
export type Tree = ReadonlyMap<string, FlatSurface>;

/** The Surfaces from the outermost down to `name`. */
export const pathOf = (tree: Tree, name: string) => {
  const path: string[] = [];
  for (let at: string | null = name; at !== null;) {
    path.unshift(at);
    at = tree.get(at)?.parent ?? null;
  }
  return path;
};

/** Whether `name` is `outer` or sits inside it. */
export const inside = (tree: Tree, name: string | null, outer: string) =>
  name !== null && pathOf(tree, name).includes(outer);

/** `name`, or the nearest Focusable Surface above it. */
export const nearestFocusable = (tree: Tree, name: string | null) =>
  name === null
    ? null
    : (pathOf(tree, name)
        .toReversed()
        .find((at) => tree.get(at)?.focusable === true) ?? null);

/**
 * The Surfaces a key climbs from the Active one: it, then each one above
 * it, up to and including the first Isolated one.
 */
export const levelsOf = (tree: Tree, active: string) => {
  const levels: string[] = [];
  for (const name of pathOf(tree, active).toReversed()) {
    levels.push(name);
    if (tree.get(name)?.isolated === true) break;
  }
  return levels;
};

/** The innermost Isolated Surface the Active one is in, if any. */
export const isolationOf = (tree: Tree, active: string) =>
  pathOf(tree, active)
    .toReversed()
    .find((name) => tree.get(name)?.isolated === true) ?? null;

/** How a Surface is drawn: Active, a Parent of it, Inactive, or Off. */
export type State = 'active' | 'parent' | 'inactive' | 'off';

/** Where `name` stands for the Active Surface, with Vim Mode on. */
export const stateOf = (tree: Tree, name: string, active: string): State => {
  if (name === active) return 'active';
  return pathOf(tree, active).includes(name) ? 'parent' : 'inactive';
};
