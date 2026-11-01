import type { RefObject } from 'react';
import { keys } from '../../../../commands.ts';

/*
 * The keys that scroll a scroller, on the page's Surface while it is open:
 * j and k scroll a line, Ctrl+D and Ctrl+U half a page, g g goes to the
 * top and Shift+G back to the bottom, following again; Page Up and Page
 * Down scroll even while typing. Every scroll is instant, and the
 * reader's own: scrolling up lets go of the bottom.
 */

/**
 * How far `j` and `k` scroll, in px: two lines of the transcript's text,
 * a little more than a browser's own arrow key, so a step is seen to move.
 */
const LINE = 48;

export function useScrollKeys(scroll: {
  readonly scroller: RefObject<HTMLElement | null>;
  readonly gesture: () => void;
  readonly toTop: () => void;
  readonly holdOn: () => void;
}) {
  const by = (top: number) => {
    scroll.gesture();
    scroll.scroller.current?.scrollBy({ top, behavior: 'instant' });
  };
  const page = (share: number) =>
    (scroll.scroller.current?.clientHeight ?? 0) * share;
  keys.useAction('content.down', () => by(LINE));
  keys.useAction('content.up', () => by(-LINE));
  keys.useAction('content.halfDown', () => by(page(0.5)));
  keys.useAction('content.halfUp', () => by(-page(0.5)));
  keys.useAction('content.pageDown', () => by(page(0.9)));
  keys.useAction('content.pageUp', () => by(-page(0.9)));
  keys.useAction('content.top', () => scroll.toTop());
  keys.useAction('content.bottom', () => scroll.holdOn());
}
