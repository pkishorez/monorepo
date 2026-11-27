import type { Card } from './shape.ts';

export interface More {
  readonly parent: string;
  readonly all: ReadonlyArray<Card>;
  readonly hidden: ReadonlyArray<Card>;
  readonly touched: number;
  readonly total: number;
  readonly open: boolean;
}

export interface Folded {
  readonly card: Card;
  readonly children: ReadonlyArray<Folded>;
  readonly more: More | null;
}

const MOST = 8;

const FIRST = 5;

const essential = (card: Card): boolean =>
  card.target || card.sent !== null || card.children.some(essential);

export const involved = (card: Card): boolean =>
  card.target ||
  card.sent !== null ||
  card.added ||
  card.ghost ||
  card.changed ||
  card.children.some(involved);

export const foldOf = (
  card: Card,
  picked: ReadonlySet<string>,
  open: ReadonlySet<string>,
): Folded => {
  const all = card.children;
  const fold = (child: Card) => foldOf(child, picked, open);
  if (all.length <= MOST) return { card, children: all.map(fold), more: null };
  const { address } = card.node;
  if (open.has(address))
    return {
      card,
      children: all.map(fold),
      more: {
        parent: address,
        all,
        hidden: [],
        touched: 0,
        total: all.length,
        open: true,
      },
    };
  const kept = new Set(
    all
      .filter((child) => essential(child) || picked.has(child.node.address))
      .map((child) => child.node.address),
  );
  const room = () => Math.max(0, FIRST - kept.size);
  const free = (child: Card) => !kept.has(child.node.address);
  for (const child of all.filter(free).filter(involved).slice(0, room()))
    kept.add(child.node.address);
  for (const child of all.filter(free).slice(0, room()))
    kept.add(child.node.address);
  const shown = all.filter((child) => kept.has(child.node.address));
  const hidden = all.filter(free);
  return {
    card,
    children: shown.map(fold),
    more:
      hidden.length === 0
        ? null
        : {
            parent: address,
            all,
            hidden,
            touched: hidden.filter(involved).length,
            total: all.length,
            open: false,
          },
  };
};
