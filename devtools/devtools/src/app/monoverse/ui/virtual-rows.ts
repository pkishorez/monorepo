import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from '@tanstack/react-virtual';

/*
 * A long list of rows, drawn only where it shows: the rows on screen, a
 * few more either side, and those always drawn whatever shows, the
 * selection and the row the keys are on, so the keys and Tab never lose
 * their place. Every row's height is known before it is drawn, so nothing
 * is measured, and the list is its full height from the first paint.
 */

/** Rows drawn above and below those on screen, so a quick scroll shows no gap. */
const overscan = 12;

/** The rows on screen and either side, and those always drawn, top to bottom. */
export function rowsToDraw(
  range: Range,
  keep: ReadonlyArray<number>,
): Array<number> {
  const drawn = new Set(defaultRangeExtractor(range));
  for (const index of keep)
    if (index >= 0 && index < range.count) drawn.add(index);
  return [...drawn].sort((a, b) => a - b);
}

/**
 * Where each row sits among the rows beside it, for assistive technology,
 * which cannot count the rows not drawn: its place, from 1, and how many
 * there are. Rows are top to bottom, depth-first, by their depth.
 */
export function placesAmongSiblings(
  depths: ReadonlyArray<number>,
): ReadonlyArray<{ readonly position: number; readonly of: number }> {
  interface Group {
    readonly depth: number;
    size: number;
  }
  const places: Array<{ group: Group; position: number }> = [];
  // The groups still taking rows, deepest last.
  const open: Array<Group> = [];
  for (const depth of depths) {
    while (open.length > 0 && open.at(-1)!.depth > depth) open.pop();
    let group = open.at(-1);
    if (group?.depth !== depth) {
      group = { depth, size: 0 };
      open.push(group);
    }
    group.size += 1;
    places.push({ group, position: group.size });
  }
  return places.map(({ group, position }) => ({ position, of: group.size }));
}

export interface VirtualRows {
  /** The rows to draw, by index, top to bottom. */
  readonly indices: ReadonlyArray<number>;
  /** Draws a row, wherever the list is scrolled, then runs `then`: to focus it, say. */
  readonly reach: (index: number, then: () => void) => void;
}

export function useVirtualRows({
  count,
  scroller,
  sizeOf,
  keyOf,
  offset,
  keep,
}: {
  count: number;
  /** The box that scrolls. */
  scroller: RefObject<HTMLElement | null>;
  /** Each row's height, by its index. */
  sizeOf: (index: number) => number;
  /**
   * Each row's key. A new function whenever the rows or their heights
   * change: only then are the heights read again.
   */
  keyOf: (index: number) => string;
  /** From the top of what scrolls to the top of the first row. */
  offset: number;
  /** Rows always drawn: the selection, the one Tab lands on, the one focused. */
  keep: ReadonlyArray<number | undefined>;
}): VirtualRows {
  const [reached, setReached] = useState<{ index: number } | null>(null);
  const then = useRef<(() => void) | null>(null);
  // Drawn rows change only as the list scrolls or what is kept changes.
  const kept = [
    ...keep.filter((index) => index !== undefined),
    ...(reached === null ? [] : [reached.index]),
  ].join();
  const rangeExtractor = useMemo(() => {
    const always = kept === '' ? [] : kept.split(',').map(Number);
    return (range: Range) => rowsToDraw(range, always);
  }, [kept]);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroller.current,
    estimateSize: sizeOf,
    getItemKey: keyOf,
    scrollMargin: offset,
    overscan,
    rangeExtractor,
    // Rows on the first paint, before the box is measured.
    initialRect: {
      width: 0,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    },
  });

  // Once a row reached for is drawn, what was to follow.
  useLayoutEffect(() => {
    const next = then.current;
    if (next === null) return;
    then.current = null;
    next();
  }, [reached]);

  const reach = useCallback((index: number, next: () => void) => {
    then.current = next;
    setReached({ index });
  }, []);

  return {
    indices: virtualizer.getVirtualIndexes(),
    reach,
  };
}
