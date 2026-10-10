import { Schema } from 'effect';
import { DEFAULT_COLUMNS } from './default-board.js';

/*
 * The board as data: columns of cards, in order. A card's place is its
 * index in its column's array; Foldkit's fractional sort keys are left out.
 */

export const Card = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
});

export const Columns = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    cards: Schema.Array(Card),
  }),
);
export type Columns = typeof Columns.Type;
type Card = typeof Card.Type;

/** The board a first visit starts with. */
export const defaultColumns = (): Columns => DEFAULT_COLUMNS;

/** Take a card out of its column and put it at `index` of another (or the same) one. */
export const moveCard = (
  columns: Columns,
  cardId: string,
  toColumnId: string,
  index: number,
): Columns => {
  const card = columns
    .flatMap((column) => column.cards)
    .find((each) => each.id === cardId);
  if (!card) return columns;
  return columns.map((column) => {
    const cards = column.cards.filter((each) => each.id !== cardId);
    if (column.id !== toColumnId) return { ...column, cards };
    return {
      ...column,
      cards: [...cards.slice(0, index), card, ...cards.slice(index)],
    };
  });
};

export const appendCard = (
  columns: Columns,
  columnId: string,
  card: Card,
): Columns =>
  columns.map((column) =>
    column.id === columnId
      ? { ...column, cards: [...column.cards, card] }
      : column,
  );

/** Where a card is: its column and its index there. */
export const placeOf = (columns: Columns, cardId: string) => {
  for (const column of columns) {
    const index = column.cards.findIndex((card) => card.id === cardId);
    if (index >= 0) return { columnId: column.id, index };
  }
  return null;
};
