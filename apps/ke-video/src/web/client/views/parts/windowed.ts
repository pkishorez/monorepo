import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { indexAt, offsetsOf, rangeOf } from '../../format/index.ts';

/*
 * A long list that draws only the rows in view and a screen either side,
 * the rest kept as room above and below it: the transcript's lines and
 * the cuts, a thousand or more. Each row's height is measured as it is
 * drawn and kept by its key; one not yet drawn is guessed. When a row
 * above what is seen changes height, the scroll moves by as much, so what
 * is seen stays put. The list scrolls with the page, or in `box` when
 * that scrolls on its own, as a laptop's side column does. It tells
 * `onTop` the row at the top of what is seen as that changes, so where it
 * was read can be kept, and `hold` takes it back there: the row is kept
 * at the top while the page around it settles, until a hand moves it.
 */

/** How long `hold` keeps its row at the top, in ms, unless a hand moves it first. */
const HOLD_MS = 1500;

const HANDS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/** How far past what is seen rows are drawn, in px, either side. */
const OVERSCAN = 800;

/** How many rows are drawn before the view is known. */
const FIRST = 24;

/** Where what stays at the top of the page ends, in viewport px. */
const pinnedBottom = () =>
  document.querySelector('[data-pinned]')?.getBoundingClientRect().bottom ?? 0;

const scrollBy = (box: HTMLElement | null, by: number) => {
  if (box === null) scrollTo({ top: scrollY + by, behavior: 'instant' });
  else box.scrollTop += by;
};

export function useWindowed({
  count,
  keyOf,
  estimate,
  box,
  live,
  onTop,
}: {
  readonly count: number;
  /** A row's key, the same for it whichever rows are shown. */
  readonly keyOf: (index: number) => string;
  /** A row's height in px until it is measured. */
  readonly estimate: (index: number) => number;
  /** What holds the list: it scrolls it when it scrolls on its own. */
  readonly box: RefObject<HTMLElement | null>;
  /** Whether the list can be seen: hidden, it keeps the rows it drew. */
  readonly live: boolean;
  /** Told the row at the top of what is seen, below what is pinned, as it changes. */
  readonly onTop?: (index: number) => void;
}) {
  const list = useRef<HTMLOListElement | null>(null);
  const heights = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, FIRST) });

  const offsets = useMemo(
    () =>
      offsetsOf(
        count,
        (index) => heights.current.get(keyOf(index)) ?? estimate(index),
      ),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `version` counts the heights measured.
    [count, keyOf, estimate, version],
  );
  const latest = useRef({ offsets, keyOf, estimate, live, onTop });
  latest.current = { offsets, keyOf, estimate, live, onTop };
  const top = useRef(-1);
  // The row `hold` keeps at the top, until when, and below what.
  const held = useRef<{
    readonly index: number;
    readonly until: number;
    readonly pinned: () => number;
  } | null>(null);

  // What scrolls the list: its box when that scrolls on its own, else the page.
  const scroller = () => {
    const element = box.current;
    return element !== null && getComputedStyle(element).overflowY !== 'visible'
      ? element
      : null;
  };
  // What is seen, in px from the list's top.
  const view = () => {
    const element = list.current;
    if (element === null) return null;
    const top = element.getBoundingClientRect().top;
    const holder = scroller()?.getBoundingClientRect();
    return holder === undefined
      ? { top: -top, bottom: innerHeight - top }
      : { top: holder.top - top, bottom: holder.bottom - top };
  };
  // Row `index` at the top of what is seen, below `pinned`, at once.
  const jump = (index: number, pinned: number) => {
    const element = list.current;
    const offset = latest.current.offsets[index];
    if (element === null || offset === undefined) return;
    const top = element.getBoundingClientRect().top + offset;
    const holder = scroller();
    if (holder === null)
      scrollTo({ top: scrollY + top - pinned, behavior: 'instant' });
    else
      holder.scrollTo({
        top: holder.scrollTop + top - holder.getBoundingClientRect().top,
        behavior: 'instant',
      });
  };
  const update = () => {
    if (!latest.current.live) return;
    const seen = view();
    if (seen === null) return;
    const next = rangeOf(
      latest.current.offsets,
      seen.top,
      seen.bottom,
      OVERSCAN,
    );
    setRange((was) =>
      was.start === next.start && was.end === next.end ? was : next,
    );
    const cover = scroller() === null ? Math.max(0, pinnedBottom()) : 0;
    const first =
      seen.top + cover <= 0
        ? 0
        : indexAt(latest.current.offsets, seen.top + cover);
    const hold = held.current;
    if (hold !== null && performance.now() > hold.until) held.current = null;
    else if (hold !== null) {
      if (first !== hold.index) jump(hold.index, hold.pinned());
      return;
    }
    if (first !== top.current) {
      top.current = first;
      latest.current.onTop?.(first);
    }
  };
  const updateLater = useRef(update);
  updateLater.current = update;

  useLayoutEffect(update, [offsets, live]);
  useEffect(() => {
    let frame = 0;
    const changed = () => {
      if (frame === 0)
        frame = requestAnimationFrame(() => {
          frame = 0;
          updateLater.current();
        });
    };
    const moved = () => {
      held.current = null;
    };
    // Captured on the page, so a box's own scroll is heard too.
    addEventListener('scroll', changed, { capture: true, passive: true });
    addEventListener('resize', changed);
    for (const name of HANDS)
      addEventListener(name, moved, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', changed, { capture: true });
      removeEventListener('resize', changed);
      for (const name of HANDS)
        removeEventListener(name, moved, { capture: true });
    };
  }, []);

  const [observer] = useState(() =>
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          const { offsets, keyOf, estimate } = latest.current;
          const seen = view();
          let changed = false;
          let shift = 0;
          for (const entry of entries) {
            const element = entry.target as HTMLElement;
            const index = Number(element.dataset.index);
            const height =
              entry.borderBoxSize?.[0]?.blockSize ?? element.offsetHeight;
            // A row laid out nowhere, as in a hidden tab, tells nothing.
            if (!(height > 0) || !(index < offsets.length - 1)) continue;
            const key = keyOf(index);
            const was = heights.current.get(key) ?? estimate(index);
            heights.current.set(key, height);
            if (Math.abs(was - height) < 0.5) continue;
            changed = true;
            if (seen !== null && offsets[index]! + was <= seen.top)
              shift += height - was;
          }
          if (shift !== 0) scrollBy(scroller(), shift);
          if (changed) setVersion((count) => count + 1);
        }),
  );
  useEffect(() => () => observer?.disconnect(), [observer]);

  /** A drawn row's ref: it is measured while it is drawn. */
  const measure = useCallback(
    (element: HTMLElement | null) => {
      if (element === null || observer === null) return;
      observer.observe(element);
      return () => observer.unobserve(element);
    },
    [observer],
  );

  const end = Math.min(range.end, count);
  const start = Math.min(range.start, end);
  return {
    list,
    start,
    end,
    /** The room the rows above and below the drawn ones take, in px. */
    before: offsets[start] ?? 0,
    after: (offsets[count] ?? 0) - (offsets[end] ?? 0),
    measure,
    /**
     * Puts row `index` at the top of what is seen, below what `pinned`
     * gives, and keeps it there while the page settles: until a hand
     * moves the page, or for a moment.
     */
    hold: (index: number, pinned: () => number) => {
      held.current = { index, until: performance.now() + HOLD_MS, pinned };
      jump(index, pinned());
      const settle = () => {
        if (held.current === null) return;
        updateLater.current();
        requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    },
    /** The row at `px` from the list's top. */
    indexAt: (px: number) => indexAt(latest.current.offsets, px),
    /**
     * Scrolls row `index` `place` of the way down what can be seen, a
     * third unless said: of its box, or of the page below what stays at
     * its top (`pinned`).
     */
    show: (
      index: number,
      pinned: number,
      behavior: ScrollBehavior,
      place = 1 / 3,
    ) => {
      const element = list.current;
      const offset = latest.current.offsets[index];
      if (element === null || offset === undefined) return;
      const top = element.getBoundingClientRect().top + offset;
      const holder = scroller();
      const by =
        holder === null
          ? top - pinned - (innerHeight - pinned) * place
          : top -
            holder.getBoundingClientRect().top -
            holder.clientHeight * place;
      // A far line is jumped to: rows drawn on the way are measured, and
      // keeping them still would stop a smooth scroll short.
      const far = Math.abs(by) > (holder?.clientHeight ?? innerHeight) * 2;
      const how = far ? 'instant' : behavior;
      if (holder === null) scrollTo({ top: scrollY + by, behavior: how });
      else holder.scrollTo({ top: holder.scrollTop + by, behavior: how });
    },
  };
}
