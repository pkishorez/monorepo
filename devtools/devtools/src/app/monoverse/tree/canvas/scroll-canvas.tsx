import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { scrollbarStyles } from '@kestack/web-platform/ui/components/scroll-styles';
import { cn } from '@kestack/web-platform/ui/components/utils';

import { clampZoom } from './camera.js';
import type { Point, Rect } from './geometry.js';
import type { CanvasControls } from './use-space.js';
import { ZoomControls } from './zoom-controls.js';

/*
 * The space on a phone: a plain scrolling box, so a finger scrolls it as
 * it scrolls any page, with momentum, and stops at its edges: the content
 * and a little room around it, more above for the corner buttons and below
 * for the bar docked there. Two
 * fingers, or the corner buttons, zoom around the point between them or
 * the middle of the screen; zoomed in, the content and so the room to
 * scroll grow with it.
 */

/**
 * Room around the content, inside the scrolling box: above it, clear of
 * the corner buttons (top 12px, 44px tall) when scrolled to the top; below
 * it, clear of the bar docked there.
 */
const room = { left: 12, top: 64, right: 12, bottom: 112 } as const;

export function ScrollCanvas({
  bounds,
  label,
  onEmptyClick,
  onSpace,
  controls: extra,
  children,
}: {
  bounds: Rect;
  label: string;
  onEmptyClick?: () => void;
  onSpace?: (space: CanvasControls) => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const zoomNow = useRef(1);
  const box = useRef<HTMLDivElement>(null);

  // Zooms keeping the point under `at` (the middle, by default) in place.
  const zoomTo = useCallback((next: number, at?: Point) => {
    const element = box.current;
    if (element === null) return;
    const from = zoomNow.current;
    const to = clampZoom(next);
    if (to === from) return;
    const x = at?.x ?? element.clientWidth / 2;
    const y = at?.y ?? element.clientHeight / 2;
    const worldX = (element.scrollLeft + x - room.left) / from;
    const worldY = (element.scrollTop + y - room.top) / from;
    zoomNow.current = to;
    flushSync(() => setZoom(to));
    element.scrollLeft = worldX * to + room.left - x;
    element.scrollTop = worldY * to + room.top - y;
  }, []);

  // Two fingers pinch; the browser's own pinch would zoom the whole page.
  useEffect(() => {
    const element = box.current;
    if (element === null) return;
    let pinch: { spread: number; zoom: number } | null = null;
    const spreadOf = (touches: TouchList) => {
      const [a, b] = [touches[0]!, touches[1]!];
      const frame = element.getBoundingClientRect();
      return {
        spread: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        middle: {
          x: (a.clientX + b.clientX) / 2 - frame.left,
          y: (a.clientY + b.clientY) / 2 - frame.top,
        },
      };
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      pinch = { spread: spreadOf(event.touches).spread, zoom: zoomNow.current };
    };
    const onMove = (event: TouchEvent) => {
      if (pinch === null || event.touches.length !== 2) return;
      event.preventDefault();
      const { spread, middle } = spreadOf(event.touches);
      if (pinch.spread > 0)
        zoomTo((pinch.zoom * spread) / pinch.spread, middle);
    };
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    element.addEventListener('touchstart', onStart, { passive: true });
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', onEnd);
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', onEnd);
    };
  }, [zoomTo]);

  const controls = useMemo<CanvasControls>(
    () => ({
      // Scrolls as little as it takes to bring `rect` on screen.
      reveal: (rect) => {
        const element = box.current;
        if (element === null) return;
        const scale = zoomNow.current;
        const top = room.top + (rect.y - bounds.y) * scale;
        const bottom = top + rect.height * scale;
        const left = room.left + (rect.x - bounds.x) * scale;
        const right = left + rect.width * scale;
        const view = {
          top: element.scrollTop,
          left: element.scrollLeft,
          height: element.clientHeight,
          width: element.clientWidth,
        };
        const y =
          top < view.top
            ? top - 16
            : bottom > view.top + view.height
              ? bottom - view.height + 16
              : view.top;
        const x =
          left < view.left
            ? left - 16
            : right > view.left + view.width
              ? right - view.width + 16
              : view.left;
        element.scrollTo({ top: y, left: x, behavior: 'smooth' });
      },
      zoomBy: (factor) => zoomTo(zoomNow.current * factor),
      home: () => {
        zoomTo(1);
        box.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      },
    }),
    [bounds.x, bounds.y, zoomTo],
  );
  useEffect(() => {
    onSpace?.(controls);
  }, [controls, onSpace]);

  return (
    <div
      role="tree"
      aria-label={label}
      className="relative h-full w-full select-none"
      onClick={(event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('[data-row], [data-space-ignore]') === null)
          onEmptyClick?.();
      }}
    >
      <div
        ref={box}
        className={cn(
          'absolute inset-0 overflow-auto overscroll-contain',
          scrollbarStyles,
        )}
        style={{ touchAction: 'pan-x pan-y' }}
      >
        <div
          className="relative"
          style={{
            width: bounds.width * zoom + room.left + room.right,
            height: bounds.height * zoom + room.top + room.bottom,
          }}
        >
          <div
            className="absolute origin-top-left"
            style={{
              left: room.left - bounds.x * zoom,
              top: room.top - bounds.y * zoom,
              transform: `scale(${zoom})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <ZoomControls
        onOut={() => controls.zoomBy(1 / 1.25)}
        onIn={() => controls.zoomBy(1.25)}
        onHome={controls.home}
      >
        {extra}
      </ZoomControls>
    </div>
  );
}
