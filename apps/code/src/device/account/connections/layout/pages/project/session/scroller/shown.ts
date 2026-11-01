import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type { Anchor } from './anchor.ts';

/*
 * Which of a list's blocks are drawn: its last few, or from where the
 * reader was, to its end; more above each time the reader nears the top
 * of what is drawn, a view and a half before they reach it, so scrolling
 * up seldom finds the end of what is drawn. A block arriving after is
 * drawn, at the end; nothing drawn is taken away. Going to the top draws
 * them all.
 *
 * A group of blocks laid out once, such as a turn, may be skipped by the
 * browser while far from the view (`content-visibility`), as tall as it
 * was, so a resize, or the sidebar sliding beside it, touches only what is
 * in sight.
 */

/** How many blocks are drawn on opening, and how many more each time. */
const BATCH = 30;

/** How far above the view the top of what is drawn starts drawing more: a view and a half. */
const NEAR_TOP = '150% 0px 0px 0px';

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
 * the mark to put above it, which draws more as the reader nears it. With
 * no scroll, or no order, every block is drawn.
 */
export function useShown(
  scroll: Scroll | null,
  order: ReadonlyArray<string> | null,
) {
  const drawing = scroll !== null && order !== null;
  const [first, setFirst] = useState(() =>
    drawing ? firstOf(order, scroll.anchor) : null,
  );
  const from =
    first === null || order === null ? 0 : Math.max(0, order.indexOf(first));
  // As drawn, not as a render still on its way would draw it.
  const latest = useRef({ order, from });
  useLayoutEffect(() => {
    latest.current = { order, from };
  });
  useLayoutEffect(() => {
    if (!drawing) return;
    scroll.drawn = true;
    scroll.showAll = () => flushSync(() => setFirst(null));
    return () => {
      scroll.showAll = () => {};
    };
  }, [scroll, drawing]);
  // More drawn above: the view stays where it was before the next frame.
  useLayoutEffect(() => {
    if (drawing) scroll.place();
  }, [scroll, drawing, from]);
  const mark = useRef<HTMLDivElement>(null);
  const more = drawing && from > 0;
  // Once the whole page is on it, its scroller too; anew for each first
  // block drawn, as the mark is put anew above it.
  useEffect(() => {
    const element = mark.current;
    if (
      !more ||
      element === null ||
      scroll?.scroller == null ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        const { order, from } = latest.current;
        const next = order?.[Math.max(0, from - BATCH)] ?? null;
        startTransition(() => setFirst(next));
      },
      { root: scroll.scroller, rootMargin: NEAR_TOP },
    );
    seen.observe(element);
    return () => seen.disconnect();
  }, [scroll, first, more]);
  return {
    /** The index of the first block drawn. */
    from,
    /** Put above the first block drawn, while there are more above it. */
    mark: more ? mark : null,
  };
}
