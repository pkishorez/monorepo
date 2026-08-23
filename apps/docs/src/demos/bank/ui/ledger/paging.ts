import { useEffect, useRef, useState, type RefObject } from 'react';

import {
  LEDGER_FIRST_PAGE,
  LEDGER_NEXT_PAGE,
} from '../../contract/tuning/index.ts';

export interface Paging {
  readonly hasMore: boolean;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly moreRef: RefObject<HTMLLIElement | null>;
}

/** Grows `limit` as the sentinel scrolls into view; `total` is how many rows exist in all. */
export const usePaging = (total: number) => {
  const [limit, setLimit] = useState(LEDGER_FIRST_PAGE);
  const hasMore = total > limit;
  const scrollRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!hasMore) return;
    const root = scrollRef.current;
    const more = moreRef.current;
    if (root === null || more === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setLimit((n) => n + LEDGER_NEXT_PAGE);
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(more);
    return () => observer.disconnect();
  }, [hasMore]);
  return { limit, hasMore, scrollRef, moreRef };
};
