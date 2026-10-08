import type { StoryNode } from 'laymos/story/schema';

import {
  cardMapOf,
  unionRect,
  type CardMap,
  type PlacedCard as PlacedCardBase,
  type Rect,
  type Size,
} from '../../canvas-space';

export { unionRect };
export type { Point, Rect, Size } from '../../canvas-space';

/** One Story card in the space, keyed by its Story id. */
export interface PlacedCard extends PlacedCardBase {
  readonly story: StoryNode;
  readonly depth: number;
  /** Keys of the sub-Story cards shown to its right, in Telling order. */
  readonly children: readonly string[];
}

export type MindMap = CardMap<PlacedCard>;

export interface Spacing {
  /** Between a card's right edge and its children's left edges. */
  readonly column: number;
  /** Between two sibling cards. */
  readonly row: number;
  /** Extra room around a sibling whose own children are showing. */
  readonly branch: number;
}

export const defaultSpacing: Spacing = { column: 64, row: 14, branch: 28 };

interface Branch {
  readonly story: StoryNode;
  readonly size: Size;
  readonly children: readonly {
    readonly branch: Branch;
    readonly dy: number;
  }[];
  /** How far the branch reaches above and below its card's top edge. */
  readonly top: number;
  readonly bottom: number;
}

function grow(
  story: StoryNode,
  open: ReadonlySet<string>,
  sizeOf: (story: StoryNode) => Size,
  spacing: Spacing,
  maxWidth: number,
): Branch {
  const preferred = sizeOf(story);
  const size = { ...preferred, width: Math.min(preferred.width, maxWidth) };
  const branches = open.has(story.id)
    ? story.stories.map((child) => grow(child, open, sizeOf, spacing, maxWidth))
    : [];

  // Siblings stack by their whole reach, so no two branches overlap.
  let cursor = 0;
  const stacked = branches.map((branch, index) => {
    const previous = branches[index - 1];
    if (previous !== undefined) {
      const opened = previous.children.length > 0 || branch.children.length > 0;
      cursor += spacing.row + (opened ? spacing.branch : 0);
    }
    const dy = cursor - branch.top;
    cursor += branch.bottom - branch.top;
    return { branch, dy };
  });

  // The children's block is centred on the card that opened them.
  const blockTop = branches.length === 0 ? 0 : size.height / 2 - cursor / 2;
  const children = stacked.map(({ branch, dy }) => ({
    branch,
    dy: blockTop + dy,
  }));

  return {
    story,
    size,
    children,
    top: Math.min(0, blockTop),
    bottom: Math.max(size.height, blockTop + cursor),
  };
}

/**
 * Places the Story tree as a mind map growing rightward: the top Story at
 * the origin, each open Story's sub-Stories in a column to its right,
 * centred on it. Only Stories are cards: Proofs live inside their Story's
 * card. Each card takes its preferred width from `sizeOf`, but no more than
 * `maxWidth`: the one place a card's size is decided. Pure: the same tree,
 * open Stories and card sizes always give the same map.
 */
export function layoutMindMap(
  tree: StoryNode,
  open: ReadonlySet<string>,
  sizeOf: (story: StoryNode) => Size,
  spacing: Spacing = defaultSpacing,
  maxWidth = Number.POSITIVE_INFINITY,
): MindMap {
  const cards: PlacedCard[] = [];
  const place = (
    branch: Branch,
    x: number,
    y: number,
    parentKey: string | null,
    depth: number,
  ) => {
    cards.push({
      key: branch.story.id,
      story: branch.story,
      parentKey,
      depth,
      x,
      y,
      width: branch.size.width,
      height: branch.size.height,
      children: branch.children.map(({ branch: child }) => child.story.id),
    });
    for (const { branch: child, dy } of branch.children) {
      place(
        child,
        x + branch.size.width + spacing.column,
        y + dy,
        branch.story.id,
        depth + 1,
      );
    }
  };
  place(grow(tree, open, sizeOf, spacing, maxWidth), 0, 0, null, 0);
  return cardMapOf(cards);
}

/** The box around a card and the sub-Story cards it shows. */
export function familyRect(map: MindMap, key: string): Rect | undefined {
  const card = map.byKey.get(key);
  if (card === undefined) return undefined;
  return unionRect(
    [card.key, ...card.children].flatMap((child) => map.byKey.get(child) ?? []),
  );
}
