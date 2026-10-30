import type { useElementScrollRestoration } from '@kestack/kabuki/routing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { keys } from '../../../commands.ts';

/*
 * Keeps a scroller at its bottom while it is there: whenever what it holds
 * grows, a reader at the bottom stays at the bottom. Only the reader
 * scrolling up lets go (wheel, touch, a drag, a key in the scroller, or a
 * scroll Action through `letGo`), never a scroll the page made by itself,
 * such as content shrinking for a moment as it redraws; reaching the
 * bottom again, or `holdOn`, holds on. It opens at the bottom, and opens
 * there again for each new `key`, such as another session in the same
 * page, unless the history entry kept where it was scrolled (`kept`), as
 * on Back and Forward: then it opens there, as soon as what it holds is
 * long enough to reach it, and follows only once the reader is at the
 * bottom again. The scroller itself changing size, as the Draft under it
 * grows when it is written in, keeps a reader at the bottom there too.
 *
 * Opening or shutting anything in it, by a click or a key, is reading,
 * not new words: what was clicked stays just where it was on the screen,
 * whatever grew or shrank above or below it, and it follows on only if
 * that left the reader at the bottom. Away from the bottom, `away` says
 * so, for a way back down. What is drawn above the view without the
 * reader asking, as a long transcript's turns drawn after it opens, moves
 * the view by as much through `shift`, so it stays where it was on the
 * screen, and the reader's own scroll up still lets go.
 *
 * Its keys, on the page's Surface while it is open (`useScrollKeys`): j
 * and k scroll a line, Ctrl+D and Ctrl+U half a page, g g goes to the top
 * and Shift+G back to the bottom, following again; Page Up and Page Down
 * scroll even while typing. Every scroll is instant; scrolling up lets go.
 */

/**
 * How far `j` and `k` scroll, in px: two lines of the transcript's text,
 * a little more than a browser's own arrow key, so a step is seen to move.
 */
const LINE = 48;

/**
 * Closer than this to the bottom is at the bottom: a glide that ends a
 * little short, or a row redrawn a few px taller, still follows. No more
 * than `LINE`, so one `k` up from the bottom is away from it, and the
 * scroll it makes does not hold on again.
 */
const NEAR = LINE;

/**
 * How long after a reader's own wheel, touch or key a scroll up still
 * counts as theirs, in ms: a flick or a wheel's spin goes on scrolling, by
 * the browser's momentum, for up to about a second after its last event.
 * A scroll up with no gesture that recent is the page's own, as when what
 * it holds shrinks for a moment as it redraws.
 */
const GESTURE_MS = 1000;

/**
 * How long after a click what grows is its opening, not new words, in ms:
 * long enough for what the click opened to draw and settle its height.
 */
const PIN_MS = 300;

export function useFollow(
  key: string,
  kept: ReturnType<typeof useElementScrollRestoration>,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const toBottom = useRef((_smooth?: boolean) => {});
  const shiftBy = useRef((_by: number) => {});
  /** Where the entry was scrolled, until it is reached or the reader moves. */
  const target = useRef<number | null>(null);
  const keptNow = useRef(kept);
  keptNow.current = kept;
  /** Whether the reader is away from the bottom and not following. */
  const [away, setAway] = useState(false);
  useEffect(() => {
    const outer = scroller.current;
    const inner = content.current;
    if (!outer || !inner) return;
    target.current = keptNow.current?.scrollY ?? null;
    stuck.current = target.current === null;
    let last = 0;
    let gesture = -Infinity;
    let pinUntil = -Infinity;
    const gap = () => outer.scrollHeight - outer.scrollTop - outer.clientHeight;
    const report = () => setAway(!stuck.current && gap() >= NEAR);
    toBottom.current = (smooth = false) => {
      outer.scrollTo({
        top: outer.scrollHeight,
        behavior:
          smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'instant',
      });
      if (!smooth) last = outer.scrollTop;
      report();
    };
    // Moved as much as what was drawn above it: no scroll of the reader's,
    // so a scroll of theirs it lands within is still told by its direction.
    shiftBy.current = (by) => {
      const before = outer.scrollTop;
      outer.scrollTop = before + by;
      last += outer.scrollTop - before;
    };
    /** Back where the entry was, once what it holds reaches that far. */
    const toKept = () => {
      const to = target.current;
      if (to === null) return;
      outer.scrollTop = to;
      last = outer.scrollTop;
      // Not there yet, or nothing to scroll yet, as while its messages are
      // still read: a transcript too short to scroll is no bottom to hold.
      if (
        outer.scrollHeight - outer.clientHeight < to ||
        outer.scrollHeight <= outer.clientHeight
      )
        return;
      target.current = null;
      // There, it follows again only if that was the bottom.
      stuck.current = gap() < NEAR;
      report();
    };
    const onGesture = () => {
      gesture = performance.now();
      target.current = null;
    };
    /**
     * A click that opens or shuts something: keep what was clicked where
     * it is on the screen once it has drawn again, then follow on only if
     * that is still the bottom.
     */
    const onClick = (event: Event) => {
      const clicked = event.target;
      if (!(clicked instanceof Element)) return;
      const line = clicked.closest('button, [aria-expanded], li, a') ?? clicked;
      const before = line.getBoundingClientRect().top;
      target.current = null;
      pinUntil = performance.now() + PIN_MS;
      requestAnimationFrame(() => {
        if (!line.isConnected) return;
        const moved = line.getBoundingClientRect().top - before;
        if (moved !== 0) outer.scrollTop += moved;
        last = outer.scrollTop;
        stuck.current = gap() < NEAR;
        report();
      });
    };
    const onScroll = () => {
      // Putting it back where it was is not the reader's scroll.
      if (target.current !== null) return;
      const top = outer.scrollTop;
      if (gap() < NEAR) stuck.current = true;
      else if (top < last && performance.now() - gesture < GESTURE_MS)
        stuck.current = false;
      last = top;
      report();
    };
    // A glide down ends short when more arrived on the way: finish it.
    const onScrollEnd = () => {
      if (stuck.current && target.current === null && gap() > 1)
        toBottom.current();
    };
    const grown = new ResizeObserver(() => {
      // A scroll of the reader's whose event is yet to come is still theirs:
      // seen first, so a scroll up just begun lets go before anything grows.
      onScroll();
      if (target.current !== null) toKept();
      // What a click opened is not new words to follow.
      else if (stuck.current && performance.now() > pinUntil)
        toBottom.current();
      else report();
    });
    if (target.current === null) toBottom.current();
    else toKept();
    outer.addEventListener('scroll', onScroll, { passive: true });
    outer.addEventListener('scrollend', onScrollEnd);
    outer.addEventListener('wheel', onGesture, { passive: true });
    outer.addEventListener('touchmove', onGesture, { passive: true });
    outer.addEventListener('pointerdown', onGesture);
    // The browser's own keys, while the scroller itself has focus.
    outer.addEventListener('keydown', onGesture);
    // Before React draws what the click opens, so where it was is known.
    inner.addEventListener('click', onClick, { capture: true });
    grown.observe(inner);
    grown.observe(outer);
    return () => {
      outer.removeEventListener('scroll', onScroll);
      outer.removeEventListener('scrollend', onScrollEnd);
      outer.removeEventListener('wheel', onGesture);
      outer.removeEventListener('touchmove', onGesture);
      outer.removeEventListener('pointerdown', onGesture);
      outer.removeEventListener('keydown', onGesture);
      inner.removeEventListener('click', onClick, { capture: true });
      grown.disconnect();
      shiftBy.current = () => {};
    };
  }, [key]);
  const shift = useCallback((by: number) => shiftBy.current(by), []);
  return {
    scroller,
    content,
    /** Away from the bottom, not following: show a way back down. */
    away,
    /** What was drawn above the view grew by `by` px: the view moves with it. */
    shift,
    /** The reader scrolls up: stop following. */
    letGo: () => {
      target.current = null;
      stuck.current = false;
    },
    /** Back to the bottom, following again; `smooth` glides there. */
    holdOn: (smooth = false) => {
      target.current = null;
      stuck.current = true;
      toBottom.current(smooth);
    },
  };
}

/**
 * The keys that scroll what `useFollow` follows; `beforeTop` makes all of
 * what it holds be there before `g g` goes to its top.
 */
export function useScrollKeys(
  follow: ReturnType<typeof useFollow>,
  { beforeTop }: { readonly beforeTop?: () => void } = {},
) {
  const { scroller } = follow;
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
    beforeTop?.();
    follow.letGo();
    scroller.current?.scrollTo({ top: 0, behavior: 'instant' });
  });
  keys.useAction('content.bottom', () => follow.holdOn());
}
