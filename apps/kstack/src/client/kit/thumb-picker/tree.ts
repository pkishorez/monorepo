import type { ComponentType } from 'react';

/**
 * One thing to choose: its name, its icon, what choosing it does, and the
 * choices inside it. A choice with none to do is only a way in to its own.
 */
export type Choice = {
  readonly id: string;
  readonly label: string;
  readonly icon?: ComponentType<{ readonly className?: string }>;
  readonly onSelect?: () => void;
  readonly children?: ReadonlyArray<Choice>;
};

/** Whether a choice has choices inside it. */
export const opens = (choice: Choice | undefined) =>
  (choice?.children?.length ?? 0) > 0;

/**
 * The lists a path of indices goes through: the tree, then the children
 * of each choice on the path but the last.
 */
export const listsAlong = (
  tree: ReadonlyArray<Choice>,
  path: ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<Choice>> => {
  const lists = [tree];
  for (const index of path.slice(0, -1)) {
    const list = lists[lists.length - 1] ?? [];
    lists.push(list[index]?.children ?? []);
  }
  return lists;
};

/** The ids of the choices a path of indices goes through. */
export const idsAlong = (
  tree: ReadonlyArray<Choice>,
  path: ReadonlyArray<number>,
) => listsAlong(tree, path).map((list, depth) => list[path[depth] ?? -1]?.id);
