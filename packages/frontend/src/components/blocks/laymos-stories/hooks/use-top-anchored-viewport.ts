import { useReactFlow, type Node } from '@xyflow/react';
import { useEffect, useRef, useState, type RefObject } from 'react';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1;
const PADDING = 24;
const PADDING_TOP = 72;

/**
 * Positions the viewport at a readable zoom instead of shrinking to fit:
 * zoom is the fit zoom clamped into [MIN_ZOOM, MAX_ZOOM], the graph is
 * centered horizontally, and a graph taller than the viewport anchors its top
 * edge at the top rather than overwhelming at full extent.
 */
export function useTopAnchoredViewport(
  ref: RefObject<HTMLElement | null>,
  nodes: readonly Node[],
  fitKey: unknown,
) {
  const { setViewport, getNodesBounds } = useReactFlow();
  const [fitted, setFitted] = useState(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setFitted(false);
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = element.clientWidth;
        const height = element.clientHeight;
        const bounds = getNodesBounds(nodesRef.current as Node[]);
        if (width > 0 && height > 0 && bounds.width > 0 && bounds.height > 0) {
          const fitZoom = Math.min(
            (width - PADDING * 2) / bounds.width,
            (height - PADDING_TOP - PADDING) / bounds.height,
          );
          const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitZoom));
          const x = width / 2 - (bounds.x + bounds.width / 2) * zoom;
          const contentHeight = bounds.height * zoom;
          const y =
            contentHeight + PADDING_TOP + PADDING <= height
              ? PADDING_TOP +
                (height - PADDING_TOP - PADDING - contentHeight) / 2 -
                bounds.y * zoom
              : PADDING_TOP - bounds.y * zoom;
          void setViewport({ x, y, zoom });
        }
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
  }, [fitKey, getNodesBounds, ref, setViewport]);
  return fitted;
}
