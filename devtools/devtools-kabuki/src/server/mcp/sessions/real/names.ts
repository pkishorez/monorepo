import type { Looked } from '../../../rpc/session/contract/index.ts';

export interface Named {
  readonly node: Looked;
  readonly depth: number;
  readonly parent: string | null;
  readonly name: string;
}

const keyText = (key: string): string => {
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) ? value.map(String).join(' ') : String(value);
  } catch {
    return key;
  }
};

const keyed = (node: Looked) =>
  node.key === undefined || node.key === ''
    ? node.actor
    : `${node.actor}[${keyText(node.key)}]`;

interface Placed {
  readonly node: Looked;
  readonly depth: number;
  readonly parent: Looked | null;
}

const flat = (
  node: Looked,
  depth: number,
  parent: Looked | null,
): ReadonlyArray<Placed> => [
  { node, depth, parent },
  ...node.children.flatMap((child) => flat(child, depth + 1, node)),
];

const counted = (names: ReadonlyArray<string>) => {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return (name: string) => counts.get(name) === 1;
};

export const namesOf = (root: Looked): ReadonlyArray<Named> => {
  const all = flat(root, 0, null);
  const actorAlone = counted(all.map(({ node }) => node.actor));
  const keyedAlone = counted(all.map(({ node }) => keyed(node)));
  const short = (node: Looked) =>
    actorAlone(node.actor) ? node.actor : keyed(node);
  const within = ({ node, parent }: Placed) =>
    parent === null ? keyed(node) : `${short(parent)}/${keyed(node)}`;
  const withinAlone = counted(all.map(within));
  return all.map((one) => ({
    node: one.node,
    depth: one.depth,
    parent: one.parent?.address ?? null,
    name:
      actorAlone(one.node.actor) || keyedAlone(keyed(one.node))
        ? short(one.node)
        : withinAlone(within(one))
          ? within(one)
          : one.node.address,
  }));
};

const loosely = ({ name, node }: Named, given: string) =>
  [name, node.actor, node.slot ?? ''].some(
    (one) => one.toLowerCase() === given,
  );

export const addressOf = (named: ReadonlyArray<Named>, given: string) => {
  const exact = named.find(
    ({ node, name }) => name === given || node.address === given,
  );
  if (exact !== undefined) return exact.node.address;
  const loose = named.filter((one) => loosely(one, given.toLowerCase()));
  return loose.length === 1 ? loose[0]!.node.address : undefined;
};

const stateOf = (state: string) => (state === 'Single' ? '' : ` [${state}]`);

export const treeOf = (named: ReadonlyArray<Named>) =>
  named.map(
    ({ node, depth, name }) =>
      `${' '.repeat(depth)}${name}${stateOf(node.state)}`,
  );

export const changesOf = (
  before: ReadonlyArray<Named>,
  after: ReadonlyArray<Named>,
) => {
  const was = new Map(before.map((one) => [one.node.address, one]));
  const is = new Map(after.map((one) => [one.node.address, one]));
  const removed = new Set(
    before
      .filter(({ node }) => !is.has(node.address))
      .map(({ node }) => node.address),
  );
  return [
    ...after.flatMap((one) => {
      const old = was.get(one.node.address);
      if (old === undefined) return [`+ ${one.name}${stateOf(one.node.state)}`];
      return old.node.state === one.node.state
        ? []
        : [`${one.name} ${old.node.state} → ${one.node.state}`];
    }),
    ...before
      .filter(
        ({ node, parent }) =>
          removed.has(node.address) &&
          (parent === null || !removed.has(parent)),
      )
      .map((one) => `- ${one.name}`),
  ];
};
