import { type DragEvent, useState } from 'react';

/*
 * With a mouse, a Session's row drags where a finger would swipe it: an
 * unsettled one onto "Settled" to Settle it, a Settled one back onto the
 * Sessions to un-Settle it. The browser draws the row under the pointer
 * as it goes and scrolls the sidebar near its edges; the place it may be
 * dropped on is lit while it is over it. It carries only which Session it
 * is, as its own kind of data: never the row's link, so nothing else on
 * the page, the Draft above all, takes it as text.
 */

/** The kind of data a dragged row carries, by whether it is Settled. */
const kindOf = (settled: boolean) =>
  settled ? 'application/x-code-settled-session' : 'application/x-code-session';

/** A Session, by its Connection and its id. */
export interface Dragged {
  readonly connectionId: string;
  readonly sessionId: string;
}

/** What makes a Session's row drag. */
export const dragOf = (session: Dragged & { readonly settled: boolean }) => ({
  draggable: true,
  onDragStart: (event: DragEvent<HTMLElement>) => {
    const { dataTransfer, currentTarget } = event;
    // The link's own address goes, so no text box takes it.
    dataTransfer.clearData();
    dataTransfer.setData(
      kindOf(session.settled),
      JSON.stringify({
        connectionId: session.connectionId,
        sessionId: session.sessionId,
      } satisfies Dragged),
    );
    dataTransfer.effectAllowed = 'move';
    // The row itself under the pointer, held where it was picked up.
    const box = currentTarget.getBoundingClientRect();
    dataTransfer.setDragImage(
      currentTarget,
      event.clientX - box.left,
      event.clientY - box.top,
    );
  },
});

/**
 * A place a row is dropped on to go to `settled`: it takes only a row
 * that is not there yet, says while one is over it, and runs `onDrop`
 * with the Session dropped.
 */
export function useDropToMove(
  settled: boolean,
  onDrop: (dragged: Dragged) => void,
) {
  const [over, setOver] = useState(false);
  const kind = kindOf(!settled);
  const takes = (event: DragEvent<HTMLElement>) =>
    event.dataTransfer.types.includes(kind);
  const hover = (event: DragEvent<HTMLElement>) => {
    if (!takes(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOver(true);
  };
  return {
    over,
    props: {
      'data-over': over || undefined,
      onDragEnter: hover,
      onDragOver: hover,
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        // Only leaving it, not passing from one of its rows to another.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOver(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setOver(false);
        if (!takes(event)) return;
        event.preventDefault();
        onDrop(JSON.parse(event.dataTransfer.getData(kind)) as Dragged);
      },
    },
  };
}
