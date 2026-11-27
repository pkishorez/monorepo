import type { Change, Node } from '../../../rpc/session/contract/index.ts';

export interface Named {
  readonly node: Node;
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

const keyed = (node: Node) =>
  node.key === undefined || node.key === ''
    ? node.actor
    : `${node.actor}[${keyText(node.key)}]`;

interface Placed {
  readonly node: Node;
  readonly depth: number;
  readonly parent: Node | null;
}

const flat = (
  node: Node,
  depth: number,
  parent: Node | null,
): ReadonlyArray<Placed> => [
  { node, depth, parent },
  ...node.children.flatMap((child) => flat(child, depth + 1, node)),
];

const counted = (names: ReadonlyArray<string>) => {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return (name: string) => counts.get(name) === 1;
};

export const namesOf = (root: Node): ReadonlyArray<Named> => {
  const all = flat(root, 0, null);
  const actorAlone = counted(all.map(({ node }) => node.actor));
  const keyedAlone = counted(all.map(({ node }) => keyed(node)));
  const short = (node: Node) =>
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

export type NameOf = (address: string) => string;

export const nameOf = (root: Node, changes: Iterable<Change> = []): NameOf => {
  const named = new Map(
    namesOf(root).map(({ node, name }) => [node.address, name]),
  );
  const seen = new Map<string, string>();
  for (const { address, actor, key } of changes)
    seen.set(
      address,
      key === undefined || key === '' ? actor : `${actor}[${keyText(key)}]`,
    );
  return (address) => named.get(address) ?? seen.get(address) ?? address;
};
