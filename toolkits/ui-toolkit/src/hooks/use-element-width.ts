import { useEffect, useRef, useState } from 'react';

/**
 * Track an element's content width via {@link ResizeObserver}. Used to learn
 * the pixel width of the bar column so a span bar that has been clamped to its
 * pixel minimum can be visually distinguished (dimmed) from a true-width bar.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
