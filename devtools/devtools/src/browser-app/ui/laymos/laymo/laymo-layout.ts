import {
  cardMapOf,
  type CardMap,
  type PlacedCard,
  type Size,
} from '../canvas-space';
import type { LaymoNode, LaymoTree } from './laymo-tree';
import {
  defaultRankSpacing,
  layoutRanks,
  type RankLayout,
  type RankSpacing,
} from './rank-layout';

export interface LaymoCard extends PlacedCard {
  readonly node: LaymoNode;
  readonly depth: number;
  readonly open: boolean;
  /** Where its own content ends and its children begin, for an open card. */
  readonly headHeight: number;
}

export type LaymoMap = CardMap<LaymoCard>;

export interface LaymoSpacing extends RankSpacing {
  /** Around the children inside an open card. */
  readonly inset: number;
  /** Between an open card's own head and the children below it. */
  readonly headGap: number;
}

export const defaultLaymoSpacing: LaymoSpacing = {
  ...defaultRankSpacing,
  rank: 72,
  row: 20,
  column: 24,
  inset: 28,
  headGap: 16,
};

interface Branch {
  readonly node: LaymoNode;
  readonly open: boolean;
  readonly head: Size;
  readonly size: Size;
  readonly inner: RankLayout | undefined;
  readonly children: readonly Branch[];
}

/**
 * Places the card tree: the Project card holds its children, each open card
 * holds its own, ranked by `edgesOf` and wrapped toward a square. Only the
 * cards' own content is sized by `sizeOf`; a card holding children grows
 * around them. Pure: the same tree, open cards and sizes give the same map.
 */
export function layoutLaymo(
  tree: LaymoTree,
  open: ReadonlySet<string>,
  sizeOf: (node: LaymoNode, open: boolean) => Size,
  edgesOf: (node: LaymoNode) => readonly (readonly [string, string])[],
  spacing: LaymoSpacing = defaultLaymoSpacing,
): LaymoMap {
  const grow = (node: LaymoNode): Branch => {
    const isOpen = open.has(node.key);
    const head = sizeOf(node, isOpen);
    if (!isOpen || node.children.length === 0)
      return {
        node,
        open: isOpen,
        head,
        size: head,
        inner: undefined,
        children: [],
      };
    const children = node.children.map(grow);
    const inner = layoutRanks(
      children.map((child) => ({ key: child.node.key, ...child.size })),
      edgesOf(node),
      spacing,
    );
    return {
      node,
      open: true,
      head,
      inner,
      children,
      size: {
        width: Math.max(head.width, inner.width + spacing.inset * 2),
        height: head.height + spacing.headGap + inner.height + spacing.inset,
      },
    };
  };

  const cards: LaymoCard[] = [];
  const place = (
    branch: Branch,
    x: number,
    y: number,
    parentKey: string | null,
    depth: number,
  ) => {
    const rows = branch.inner?.rows ?? [];
    cards.push({
      key: branch.node.key,
      node: branch.node,
      parentKey,
      depth,
      open: branch.open,
      x,
      y,
      width: branch.size.width,
      height: branch.size.height,
      headHeight: branch.head.height,
      children: rows.flat(),
    });
    if (branch.inner === undefined) return;
    const left = x + (branch.size.width - branch.inner.width) / 2;
    const top = y + branch.head.height + spacing.headGap;
    for (const placed of branch.inner.placements) {
      const child = branch.children.find(
        ({ node }) => node.key === placed.key,
      )!;
      place(child, left + placed.x, top + placed.y, branch.node.key, depth + 1);
    }
  };
  place(grow(tree.root), 0, 0, null, 0);
  return cardMapOf(cards);
}

/** The deepest open card: the one whose children are the reader's subject. */
export function deepestOpen(map: LaymoMap): LaymoCard | undefined {
  return map.cards.reduce<LaymoCard | undefined>(
    (deepest, card) =>
      card.open &&
      card.children.length > 0 &&
      (deepest === undefined || card.depth > deepest.depth)
        ? card
        : deepest,
    undefined,
  );
}
