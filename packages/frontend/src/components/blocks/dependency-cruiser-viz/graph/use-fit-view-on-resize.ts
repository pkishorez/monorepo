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
 *
 * Pass `deps` for a container that is conditionally mounted: the effect re-runs
 * when they change, so the observer re-attaches once the element appears. Without
 * this, a container first mounted after the hook ran (e.g. a view toggled in
 * later) would never be observed and would stay hidden at opacity 0.
 */
export function useFitViewOnResize(
  ref: RefObject<HTMLElement | null>,
  deps: readonly unknown[] = [],
) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, fitView, ...deps]);
  return fitted;
}
