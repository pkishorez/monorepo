import type { RefObject } from 'react';
import { keys } from '../../../../keys.ts';

/*
 * The session's keys, on the page's Surface while it is open. j and k
 * scroll the transcript a line, Ctrl+D and Ctrl+U half a page, g g goes to
 * the top and Shift+G back to the bottom, following again. Page Up and
 * Page Down scroll it even while typing, and Mod+. stops the running turn
 * (the Draft leaves its own Side Question mode). Every
 * scroll is instant; scrolling up lets the transcript stop following new
 * messages.
 */

const LINE = 48;

export function useSessionKeys({
  scroller,
  follow,
  stop,
  canStop,
}: {
  readonly scroller: RefObject<HTMLDivElement | null>;
  readonly follow: { readonly letGo: () => void; readonly holdOn: () => void };
  readonly stop: () => void;
  readonly canStop: boolean;
}) {
  const by = (top: number) => {
    if (top < 0) follow.letGo();
    scroller.current?.scrollBy({ top, behavior: 'instant' });
  };
  const page = (share: number) => (scroller.current?.clientHeight ?? 0) * share;
  keys.useAction('content.down', () => by(LINE));
  keys.useAction('content.up', () => by(-LINE));
  keys.useAction('content.halfDown', () => by(page(0.5)));
  keys.useAction('content.halfUp', () => by(-page(0.5)));
  keys.useAction('content.pageDown', () => by(page(0.9)));
  keys.useAction('content.pageUp', () => by(-page(0.9)));
  keys.useAction('content.top', () => {
    follow.letGo();
    scroller.current?.scrollTo({ top: 0, behavior: 'instant' });
  });
  keys.useAction('content.bottom', follow.holdOn);
  keys.useAction('content.stop', stop, { enabled: canStop });
}
