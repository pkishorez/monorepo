import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import { Spinner } from '@kstackz/web-platform/components/spinner';
import { CardTile } from './card/index.js';
import type { Columns } from './columns/index.js';
import { cardTarget, columnTarget } from './drag/index.js';
import { AddCardViews, Board } from './kanban.js';

type Column = Columns[number];
type Card = Column['cards'][number];

/** Where the held card would land, if one is held. */
type Held = {
  readonly card: Card;
  readonly columnId: string;
  readonly index: number;
};

/** A column's cards as drawn: without the held card, or with it where it would land. */
const cardsOf = (column: Column, held: Held | null) => {
  if (!held) return column.cards;
  const rest = column.cards.filter((card) => card.id !== held.card.id);
  return held.columnId === column.id
    ? [...rest.slice(0, held.index), held.card, ...rest.slice(held.index)]
    : rest;
};

const BoardLayout = ({
  columns,
  held = null,
  pickUp,
  footer,
}: {
  readonly columns: Columns;
  readonly held?: Held | null;
  readonly pickUp?: (cardId: string) => void;
  readonly footer?: (columnId: string) => ReactNode;
}) => (
  <div className="size-full overflow-auto p-6">
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
      {columns.map((column) => {
        const cards = cardsOf(column, held);
        return (
          <section
            key={column.id}
            {...columnTarget(column.id)}
            aria-label={column.name}
            className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3"
          >
            <h2 className="flex justify-between text-sm font-semibold">
              {column.name}
              <span className="text-muted-foreground tabular-nums">
                {cards.length}
              </span>
            </h2>
            <ul className="flex min-h-12 flex-col gap-2">
              {cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  held={held?.card.id === card.id}
                  marks={cardTarget(card.id)}
                  onPickUp={pickUp && (() => pickUp(card.id))}
                />
              ))}
            </ul>
            {footer?.(column.id)}
          </section>
        );
      })}
    </div>
  </div>
);

export const BoardView = View.make(Board, {
  Loading: () => (
    <div className="flex size-full items-center justify-center">
      <Spinner />
    </div>
  ),
  Idle: ({ model, children, send }) => (
    <BoardLayout
      columns={model.columns}
      pickUp={(cardId) => send({ _tag: 'PickedUp', cardId })}
      footer={(columnId) => {
        if (columnId === 'todo')
          return <AddCardViews.todo node={children.todo} />;
        if (columnId === 'in-progress')
          return <AddCardViews.inProgress node={children['in-progress']} />;
        if (columnId === 'done')
          return <AddCardViews.done node={children.done} />;
        return null;
      }}
    />
  ),
  Dragging: ({ model, state }) => {
    const card = model.columns
      .flatMap((column) => column.cards)
      .find((each) => each.id === state.cardId);
    return (
      <BoardLayout
        columns={model.columns}
        held={
          card ? { card, columnId: state.columnId, index: state.index } : null
        }
      />
    );
  },
});
