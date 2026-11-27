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

const overscan = 12;

export function rowsToDraw(
  range: Range,
  keep: ReadonlyArray<number>,
): Array<number> {
  const drawn = new Set(defaultRangeExtractor(range));
  for (const index of keep)
    if (index >= 0 && index < range.count) drawn.add(index);
  return [...drawn].sort((a, b) => a - b);
}

export function placesAmongSiblings(
  depths: ReadonlyArray<number>,
): ReadonlyArray<{ readonly position: number; readonly of: number }> {
  interface Group {
    readonly depth: number;
    size: number;
  }
  const places: Array<{ group: Group; position: number }> = [];
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
  readonly indices: ReadonlyArray<number>;
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
  scroller: RefObject<HTMLElement | null>;
  sizeOf: (index: number) => number;
  keyOf: (index: number) => string;
  offset: number;
  keep: ReadonlyArray<number | undefined>;
}): VirtualRows {
  const [reached, setReached] = useState<{ index: number } | null>(null);
  const then = useRef<(() => void) | null>(null);
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
    initialRect: {
      width: 0,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
    },
  });

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
