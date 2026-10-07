/**
 * One thing to choose in a tree: its id and the choices inside it. An app
 * adds what it needs, such as a label, an icon and what choosing it does;
 * `C` is that full choice, so its children are the same kind.
 */
export type Choice<C> = {
  readonly id: string;
  readonly children?: ReadonlyArray<C> | undefined;
};

/** Whether a choice has choices inside it. */
export const opens = <C extends Choice<C>>(choice: C | undefined) => {
  'worklet';
  return (choice?.children?.length ?? 0) > 0;
};

/**
 * The lists a path of indices goes through: the tree, then the children
 * of each choice on the path but the last.
 */
export const listsAlong = <C extends Choice<C>>(
  tree: ReadonlyArray<C>,
  path: ReadonlyArray<number>,
): ReadonlyArray<ReadonlyArray<C>> => {
  'worklet';
  const lists = [tree];
  for (const index of path.slice(0, -1)) {
    const list = lists[lists.length - 1] ?? [];
    lists.push(list[index]?.children ?? []);
  }
  return lists;
};

/** The ids of the choices a path of indices goes through. */
export const idsAlong = <C extends Choice<C>>(
  tree: ReadonlyArray<C>,
  path: ReadonlyArray<number>,
) => {
  'worklet';
  return listsAlong(tree, path).map(
    (list, depth) => list[path[depth] ?? -1]?.id,
  );
};

/** The choice a path of indices ends on, if there is one. */
export const choiceAt = <C extends Choice<C>>(
  tree: ReadonlyArray<C>,
  path: ReadonlyArray<number>,
): C | undefined => {
  'worklet';
  const lists = listsAlong(tree, path);
  return lists[lists.length - 1]?.[path[path.length - 1] ?? -1];
};
