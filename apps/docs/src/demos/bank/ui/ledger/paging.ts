import { useEffect, useRef, useState } from 'react';

const FIRST_PAGE = 30;
const NEXT_PAGE = 20;

export const usePaging = (total: number) => {
  const [limit, setLimit] = useState(FIRST_PAGE);
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
        if (entry?.isIntersecting) setLimit((n) => n + NEXT_PAGE);
      },
      { root, rootMargin: '200px' },
    );
    observer.observe(more);
    return () => observer.disconnect();
  }, [hasMore]);
  return { limit, hasMore, scrollRef, moreRef };
};
