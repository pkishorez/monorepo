import { Route, useScroll } from '@kestack/kabuki/routing';
import { Pages } from '../../../shared/index.ts';
import { PlaceFrame } from '../../components/index.ts';

/*
 * A board that pans both ways. It is a Scroll area like any other, but its
 * page says `scroll: false`: Kabuki never remembers or moves it, so it
 * opens at its corner every time, as a canvas that owns its own view would.
 */

const CELLS = Array.from({ length: 24 * 16 }, (_, at) => at);

export const CanvasView = Route.view(Pages.Canvas, () => {
  const board = useScroll();
  return (
    <PlaceFrame
      place="Canvas"
      title="Canvas"
      intro="Pan the board, go anywhere, come back by Back or a link: it is at its corner again. Kabuki leaves it alone."
    >
      <div
        ref={board}
        className="h-[60dvh] overflow-auto overscroll-contain rounded-lg border border-border bg-background/60"
      >
        <div className="grid w-max grid-cols-[repeat(24,5rem)] gap-px bg-border/60 p-px">
          {CELLS.map((at) => (
            <div
              key={at}
              className="grid size-20 place-items-center bg-background font-mono text-[11px] text-muted-foreground tabular-nums"
            >
              {String.fromCharCode(65 + (at % 24))}
              {Math.floor(at / 24) + 1}
            </div>
          ))}
        </div>
      </div>
    </PlaceFrame>
  );
});
