import { useReactFlow } from '@xyflow/react';
import { useEffect, useState, type RefObject } from 'react';

import { FIT_VIEW_OPTIONS } from './react-flow-options';

/**
 * Re-fits the flow whenever its container resizes (e.g. dragging the resizable
 * divider or resizing the window). Must be called inside a `ReactFlowProvider`.
 *
 * Returns `false` until the first fit has run, so callers can keep the canvas
 * hidden through the initial unfitted frame and reveal it only once the zoom is
 * correct — avoiding the visible "zoom-correction" flicker on mount.
 */
export function useFitViewOnResize(ref: RefObject<HTMLElement | null>) {
  const { fitView } = useReactFlow();
  const [fitted, setFitted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        void fitView(FIT_VIEW_OPTIONS);
        setFitted(true);
      });
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ref, fitView]);
  return fitted;
}
