import type { Card } from '../../../logic/shared/index.ts';
import type { Rect } from './space.ts';

export interface Placed extends Rect {
  readonly card: Card;
  readonly parent: string | null;
  readonly hidden: number;
}

const GAP_X = 72;
const GAP_Y = 22;

const countOf = (card: Card): number =>
  card.children.reduce((sum, child) => sum + 1 + countOf(child), 0);

export const layout = (
  root: Card,
  sizeOf: (card: Card) => { readonly width: number; readonly height: number },
  open: (card: Card) => boolean,
): ReadonlyArray<Placed> => {
  const shown = (card: Card) => (open(card) ? card.children : []);

  const widths: number[] = [];
  const measure = (card: Card, depth: number) => {
    widths[depth] = Math.max(widths[depth] ?? 0, sizeOf(card).width);
    shown(card).forEach((child) => measure(child, depth + 1));
  };
  measure(root, 0);
  const columns = widths.reduce<number[]>(
    (at, _, depth) => [
      ...at,
      depth === 0 ? 0 : at[depth - 1]! + widths[depth - 1]! + GAP_X,
    ],
    [],
  );

  const heights = new Map<Card, number>();
  const span = (card: Card): number => {
    const own = sizeOf(card).height;
    const kids = shown(card);
    const block =
      kids.reduce((sum, child) => sum + span(child), 0) +
      Math.max(0, kids.length - 1) * GAP_Y;
    const height = Math.max(own, block);
    heights.set(card, height);
    return height;
  };
  span(root);

  const placed: Placed[] = [];
  const place = (
    card: Card,
    depth: number,
    top: number,
    parent: string | null,
  ) => {
    const { width, height } = sizeOf(card);
    placed.push({
      card,
      parent,
      hidden: open(card) ? 0 : countOf(card),
      x: columns[depth]!,
      y: top,
      width,
      height,
    });
    let cursor = top;
    for (const child of shown(card)) {
      place(child, depth + 1, cursor, card.id);
      cursor += heights.get(child)! + GAP_Y;
    }
  };
  place(root, 0, 0, null);
  return placed;
};
