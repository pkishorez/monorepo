import type { Rect } from './space.ts';
import type { Node } from './tree.ts';

/*
 * Where each card goes: top to bottom, a row per depth, each parent centred
 * over its Children. A folded card hides everything under it.
 */

export const CARD_WIDTH = 272;
export const CARD_HEIGHT = 164;
const GAP_X = 28;
const GAP_Y = 76;

export interface Placed extends Rect {
  readonly node: Node;
  readonly parent: Placed | null;
}

/**
 * `shift` slides the whole tree sideways, which is how a card clicked stays
 * still as the tree under it grows: its parent recentres, and the shift undoes
 * that for the card.
 */
export const layout = (
  root: Node,
  open: ReadonlySet<string>,
  shift = 0,
): ReadonlyArray<Placed> => {
  const shown = (node: Node) => (open.has(node.id) ? node.children : []);
  const spans = new Map<Node, number>();
  const inner = (node: Node) =>
    shown(node).reduce((sum, child) => sum + (spans.get(child) ?? 0), 0) +
    Math.max(0, shown(node).length - 1) * GAP_X;
  const measure = (node: Node) => {
    shown(node).forEach(measure);
    spans.set(node, Math.max(CARD_WIDTH, inner(node)));
  };
  measure(root);

  const placed: Array<Placed> = [];
  const place = (
    node: Node,
    left: number,
    depth: number,
    parent: Placed | null,
  ) => {
    const span = spans.get(node) ?? CARD_WIDTH;
    const one: Placed = {
      node,
      parent,
      x: left + (span - CARD_WIDTH) / 2,
      y: depth * (CARD_HEIGHT + GAP_Y),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
    placed.push(one);
    let cursor = left + (span - inner(node)) / 2;
    for (const child of shown(node)) {
      place(child, cursor, depth + 1, one);
      cursor += (spans.get(child) ?? CARD_WIDTH) + GAP_X;
    }
  };
  place(root, shift, 0, null);
  return placed;
};

/** A line from the foot of a parent to the head of its Child. */
export const lineOf = (
  from: Rect,
  to: { readonly x: number; readonly y: number },
) => {
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + CARD_WIDTH / 2;
  const y2 = to.y;
  const middle = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${middle} ${x2} ${middle} ${x2} ${y2}`;
};
