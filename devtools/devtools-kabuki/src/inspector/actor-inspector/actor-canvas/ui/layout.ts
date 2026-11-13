import type { GraphNode } from '../../../../api/index.ts';
import type { Rect } from './space.ts';

/*
 * Where each card goes, on the graph the Kabuki Session answers. Laid out
 * left to right: a column per depth, as wide as its widest card, each card
 * at the top of its block. A folded node hides everything under it.
 */

/** Every node, the root first. */
export const allOf = (node: GraphNode): ReadonlyArray<GraphNode> => [
  node,
  ...node.children.flatMap(allOf),
];

/** The ids from the root down to `id`, both ends in; empty if it is not there. */
export const pathTo = (node: GraphNode, id: string): ReadonlyArray<string> => {
  if (node.id === id) return [id];
  for (const child of node.children) {
    const below = pathTo(child, id);
    if (below.length > 0) return [node.id, ...below];
  }
  return [];
};

/**
 * The Capabilities an Actor Provides to one of its Children: at its top,
 * and in the State the Child is placed in, if any. Where the Child is
 * placed says it, so the Blueprint, with no State current, knows it too.
 */
const givesTo = (node: GraphNode, child: GraphNode): ReadonlyArray<string> => [
  ...node.blueprint.top.provides,
  ...(child.within ? (node.blueprint.state[child.within]?.provides ?? []) : []),
];

/**
 * The nearest card above `id` that provides the Capability `name` where
 * the way down to `id` is placed: the one its code gets it from. None when
 * no Actor above provides it, and the app's Layer, above the root, hands
 * it in.
 */
export const providerOf = (
  root: GraphNode,
  id: string,
  name: string,
): string | undefined => {
  const byId = new Map(allOf(root).map((node) => [node.id, node]));
  const path = pathTo(root, id);
  for (let i = path.length - 2; i >= 0; i--) {
    const node = byId.get(path[i]!);
    const child = byId.get(path[i + 1]!);
    if (node && child && givesTo(node, child).includes(name)) return node.id;
  }
  return undefined;
};

export interface Placed extends Rect {
  readonly node: GraphNode;
  readonly parent: string | null;
  /** How many Actors are folded away under it. */
  readonly hidden: number;
}

const GAP_X = 72;
/** Room enough between cards for the tab a Step's Message puts on one's top edge. */
const GAP_Y = 22;

const countOf = (node: GraphNode): number =>
  node.children.reduce((sum, child) => sum + 1 + countOf(child), 0);

export const layout = (
  root: GraphNode,
  sizeOf: (node: GraphNode) => {
    readonly width: number;
    readonly height: number;
  },
  open: (node: GraphNode) => boolean,
): ReadonlyArray<Placed> => {
  const shown = (node: GraphNode) => (open(node) ? node.children : []);

  // Each column as wide as its widest card.
  const widths: number[] = [];
  const measure = (node: GraphNode, depth: number) => {
    widths[depth] = Math.max(widths[depth] ?? 0, sizeOf(node).width);
    shown(node).forEach((child) => measure(child, depth + 1));
  };
  measure(root, 0);
  const columns = widths.reduce<number[]>(
    (at, _, depth) => [
      ...at,
      depth === 0 ? 0 : at[depth - 1]! + widths[depth - 1]! + GAP_X,
    ],
    [],
  );

  const heights = new Map<GraphNode, number>();
  const span = (node: GraphNode): number => {
    const own = sizeOf(node).height;
    const kids = shown(node);
    const block =
      kids.reduce((sum, child) => sum + span(child), 0) +
      Math.max(0, kids.length - 1) * GAP_Y;
    const height = Math.max(own, block);
    heights.set(node, height);
    return height;
  };
  span(root);

  const placed: Placed[] = [];
  const place = (
    node: GraphNode,
    depth: number,
    top: number,
    parent: string | null,
  ) => {
    const { width, height } = sizeOf(node);
    const kids = shown(node);
    placed.push({
      node,
      parent,
      hidden: open(node) ? 0 : countOf(node),
      x: columns[depth]!,
      // At the top of its block, as its Children are at the top of theirs:
      // a card that grows pushes down only what is under it, and nothing
      // above it, itself included, moves.
      y: top,
      width,
      height,
    });
    let cursor = top;
    for (const child of kids) {
      place(child, depth + 1, cursor, node.id);
      cursor += heights.get(child)! + GAP_Y;
    }
  };
  place(root, 0, 0, null);
  return placed;
};
