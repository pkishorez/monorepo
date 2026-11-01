import { startTransition, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Anchor } from './anchor.ts';

/*
 * Which of a list's blocks are drawn: from where the reader was, or its
 * last few, to its end, and above that only as much as keeps a view and a
 * half drawn above the view. It opens on a few, and draws a few more at a
 * time until that much is drawn, before it is first shown; then a few
 * more each time the reader scrolls up near the top of what is drawn. A
 * block arriving after is drawn, at the end; nothing drawn is taken away.
 * Going to the top draws them all.
 *
 * A group of blocks laid out once, such as a turn, may be skipped by the
 * browser while far from the view (`content-visibility`), as tall as it
 * was, so a resize, or the sidebar sliding beside it, touches only what is
 * in sight.
 */

/** How many blocks are drawn at a time. */
const BATCH = 10;

/** How much is kept drawn above the view, in views. */
const AHEAD = 1.5;

/** How many times more is drawn at once before the page is shown; React allows no more than 50. */
const MAX_NOW = 20;

/** The scroll of one list, as what draws its blocks shares it. */
export interface Scroll {
  /** Where the reader is. */
  anchor: Anchor;
  /** The element it scrolls in, once on the page. */
  scroller: HTMLElement | null;
  /** Whether its list is drawn: a block it does not hold then is not in it. */
  drawn: boolean;
  /** Draws every block now, to go to the top. */
  showAll: () => void;
  /** Puts the view back at the anchor now, as more is drawn above it. */
  place: () => void;
  /** Draws more above, if what is drawn there is less than enough: `before` it is shown, or as a Transition. */
  fill: (before: boolean) => void;
  /** A group's element, to be skipped far from the view once laid out. */
  readonly group: (element: HTMLElement | null) => (() => void) | undefined;
}

export const scrollOf = (anchor: Anchor): Scroll => {
  const laidOut =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const { target, borderBoxSize, contentRect } of entries) {
            const height = borderBoxSize?.[0]?.blockSize ?? contentRect.height;
            if (height <= 0) continue;
            const { style } = target as HTMLElement;
            style.containIntrinsicBlockSize = `auto ${height}px`;
            style.contentVisibility = 'auto';
            laidOut!.unobserve(target);
          }
        });
  return {
    anchor,
    scroller: null,
    drawn: false,
    showAll: () => {},
    place: () => {},
    fill: () => {},
    group: (element) => {
      if (element === null || laidOut === null) return;
      laidOut.observe(element);
      return () => laidOut.unobserve(element);
    },
  };
};

/** The first block drawn on opening: where the reader was, or the last few. */
const firstOf = (order: ReadonlyArray<string>, anchor: Anchor) =>
  anchor.at === 'block' && order.includes(anchor.id)
    ? anchor.id
    : (order[Math.max(0, order.length - BATCH)] ?? null);

/**
 * Of a list's blocks, by id in order, the index of the first drawn, and
 * the list's element, whose top is the top of what is drawn. With no
 * scroll, or no order, every block is drawn.
 */
export function useShown(
  scroll: Scroll | null,
  order: ReadonlyArray<string> | null,
) {
  const drawing = scroll !== null && order !== null;
  const [first, setFirst] = useState(() =>
    drawing ? firstOf(order, scroll.anchor) : null,
  );
  // As drawn, not as a render still on its way would draw it.
  const latest = useRef({ order, from: 0 });
  const at = first === null || order === null ? 0 : order.indexOf(first);
  // A first block gone, as two blocks of words became one: where it was.
  const from =
    at === -1 ? Math.min(latest.current.from, order?.length ?? 0) : at;
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    latest.current = { order, from };
  });
  useLayoutEffect(() => {
    if (!drawing) return;
    scroll.drawn = true;
    scroll.showAll = () => flushSync(() => setFirst(null));
    /** How many draws in a row were made before the page was shown. */
    let now = 0;
    let shown = 0;
    scroll.fill = (before) => {
      const { order, from } = latest.current;
      const outer = scroll.scroller;
      const element = list.current;
      if (from === 0 || !order || !outer || !element) return;
      const view = outer.getBoundingClientRect();
      // Not laid out, as while hidden: nothing to measure enough by.
      if (view.height === 0) return;
      if (element.getBoundingClientRect().top < view.top - view.height * AHEAD)
        return;
      const next = order[Math.max(0, from - BATCH)] ?? null;
      // Each before it is shown draws again at once; past a few, as when
      // blocks add next to nothing, the rest wait their turn.
      if (before && now < MAX_NOW) {
        now++;
        shown ||= requestAnimationFrame(() => {
          now = 0;
          shown = 0;
        });
        setFirst(next);
      } else startTransition(() => setFirst(next));
    };
    return () => {
      cancelAnimationFrame(shown);
      scroll.showAll = () => {};
      scroll.fill = () => {};
    };
  }, [scroll, drawing]);
  // More drawn above: the view stays where it was, and if that is still
  // not enough, more again, before it is shown.
  useLayoutEffect(() => {
    if (!drawing) return;
    scroll.place();
    scroll.fill(true);
  }, [scroll, drawing, from]);
  return {
    /** The index of the first block drawn. */
    from,
    /** The list's element: more is drawn above it as the view nears its top. */
    list,
    /** Whether blocks above the first drawn are still to be drawn. */
    more: drawing && from > 0,
  };
}
