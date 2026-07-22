import { useReactFlow } from '@xyflow/react';
import { useEffect, useState, type RefObject } from 'react';

const FIT_VIEW_OPTIONS = { padding: 0.2 } as const;

/** Keeps fixed graph geometry fitted when its host or topology changes. */
export function useFitViewOnResize(
  ref: RefObject<HTMLElement | null>,
  topology: unknown,
) {
  const { fitView } = useReactFlow();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void fitView(FIT_VIEW_OPTIONS);
        setFitted(true);
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitView, ref, topology]);
  return fitted;
}
