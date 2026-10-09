import { Effect, Queue, Stream } from 'effect';

/*
 * Pointer drag and drop with plain DOM events, as a Lifetime's Stream.
 *
 * While a card is held, the page's pointer moves are hit-tested against the
 * columns and cards the View marks with data attributes. Only a change of
 * drop target becomes a Message, so a drag across the board is a handful of
 * Hovered Messages, not one per pointer move. Letting go is Dropped; Escape
 * is Cancelled. Leaving the Dragging State removes the listeners.
 */

const COLUMN = 'data-kanban-column';
const CARD = 'data-kanban-card';

/** Marks an element as a column cards can be dropped into. */
export const columnTarget = (columnId: string) => ({ [COLUMN]: columnId });

/** Marks an element as a card, so the drop index can be measured past it. */
export const cardTarget = (cardId: string) => ({ [CARD]: cardId });

type Drag =
  | {
      readonly _tag: 'Hovered';
      readonly columnId: string;
      readonly index: number;
    }
  | { readonly _tag: 'Dropped' }
  | { readonly _tag: 'Cancelled' };

/** The column under the pointer, and how many of its other cards sit above it. */
const targetAt = (x: number, y: number, cardId: string) => {
  const column = document
    .elementsFromPoint(x, y)
    .map((element) => element.closest(`[${COLUMN}]`))
    .find((element) => element !== null);
  const columnId = column?.getAttribute(COLUMN);
  if (!column || !columnId) return null;
  const above = [...column.querySelectorAll(`[${CARD}]`)].filter((card) => {
    if (card.getAttribute(CARD) === cardId) return false;
    const { top, height } = card.getBoundingClientRect();
    return top + height / 2 < y;
  });
  return { columnId, index: above.length };
};

/** What the pointer and keyboard do to a held card, until it is let go. */
export const follow = (cardId: string): Stream.Stream<Drag> =>
  Stream.callback<Drag>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const move = (event: PointerEvent) => {
          const target = targetAt(event.clientX, event.clientY, cardId);
          if (target) Queue.offerUnsafe(queue, { _tag: 'Hovered', ...target });
        };
        const up = () => {
          Queue.offerUnsafe(queue, { _tag: 'Dropped' });
          Queue.endUnsafe(queue);
        };
        const key = (event: KeyboardEvent) => {
          if (event.key !== 'Escape') return;
          Queue.offerUnsafe(queue, { _tag: 'Cancelled' });
          Queue.endUnsafe(queue);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('keydown', key);
        return () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('keydown', key);
        };
      }),
      (remove) => Effect.sync(remove),
    ),
  ).pipe(
    Stream.changesWith(
      (a, b) =>
        a._tag === 'Hovered' &&
        b._tag === 'Hovered' &&
        a.columnId === b.columnId &&
        a.index === b.index,
    ),
  );
