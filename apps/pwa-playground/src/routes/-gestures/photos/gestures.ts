import {
  settle,
  usePan,
  usePinch,
  useSwipe,
  useTap,
} from 'kui-toolkit/components/blocks/gestures';
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'kui-toolkit/motion';
import { useEffect, useRef, useState } from 'react';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DISMISS_PX = 200;
const DISMISSED_MS = 700;

type Size = { readonly width: number; readonly height: number };
type Point = { readonly x: number; readonly y: number };

/**
 * A photo viewer. One finger pages sideways with a Pan that snaps from photo
 * to photo, and swipes down to dismiss: the Swipe claims down, the Pan gets
 * every other direction. Zoomed in, the Pan and Swipe are off and the photo
 * moves with two fingers. Pinch zooms around the fingers; double tap zooms
 * to the point or back to fit.
 */
export function usePhotoGestures(viewer: {
  readonly count: number;
  /** The viewer's size, measured as it resizes. */
  readonly size: Size;
  /** Where the viewer is on screen, read as a gesture lands. */
  readonly origin: () => Point;
}) {
  const { size } = viewer;
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const reducedMotion = useReducedMotion();
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // The strip of photos, one width per photo, that the paging Pan moves.
  const strip = useMotionValue(0);
  useMotionValueEvent(scale, 'change', (value) => setZoomed(value > 1.01));
  useMotionValueEvent(strip, 'change', (value) => {
    if (size.width > 0) setIndex(Math.round(-value / size.width));
  });
  // A resize keeps the strip on the photo it showed.
  const lastWidth = useRef(0);
  useEffect(() => {
    const was = lastWidth.current;
    lastWidth.current = size.width;
    if (was > 0) strip.jump(Math.round(strip.get() / was) * size.width);
  }, [strip, size.width]);

  /** Where the photo may sit at `at` scale: always covering the viewer. */
  const bounds = (at = scale.get()) => ({
    left: size.width - at * size.width,
    right: 0,
    top: size.height - at * size.height,
    bottom: 0,
  });
  const clampInto = (at: number, point: Point) => {
    const limits = bounds(at);
    return {
      x: Math.min(limits.right, Math.max(limits.left, point.x)),
      y: Math.min(limits.bottom, Math.max(limits.top, point.y)),
    };
  };
  /** Springs the zoom to `at`, keeping `point` (in the viewer) where it is. */
  const zoomTo = (at: number, point: Point) => {
    const origin = viewer.origin();
    const local = { x: point.x - origin.x, y: point.y - origin.y };
    const s = scale.get();
    const target = clampInto(at, {
      x: local.x - (at * (local.x - x.get())) / s,
      y: local.y - (at * (local.y - y.get())) / s,
    });
    void settle(scale, at);
    void settle(x, target.x);
    void settle(y, target.y);
  };
  const fit = () => {
    void settle(scale, 1);
    void settle(x, 0);
    void settle(y, 0);
  };

  usePinch({
    scale,
    x,
    y,
    min: 1,
    max: MAX_SCALE,
    onEnd: ({ scale: end }) => {
      const target = clampInto(end, { x: x.get(), y: y.get() });
      void settle(x, target.x);
      void settle(y, target.y);
    },
  });
  usePan({ fingers: 2, x, y, bounds: () => bounds() });
  useTap({
    count: 2,
    onTap: ({ point }) => (zoomed ? fit() : zoomTo(DOUBLE_TAP_SCALE, point)),
  });

  /**
   * Paging: the strip follows one finger sideways. On release, distance and
   * velocity choose the adjacent photo, then a short ease-out lands it without
   * bounce. Bounds limit each drag to the photos either side of the current one.
   */
  const current = () => Math.round(-strip.get() / (size.width || 1));
  const home = useRef(0);
  const pageTo = (to: number) => {
    const target = -to * size.width;
    strip.stop();
    if (reducedMotion) {
      strip.jump(target);
      return;
    }
    void animate(strip, target, {
      duration: 0.24,
      ease: [0.32, 0.72, 0, 1],
    });
  };
  usePan({
    axis: 'x',
    x: strip,
    momentum: false,
    enabled: !zoomed,
    onStart: () => {
      home.current = current();
    },
    bounds: () => ({
      left: -Math.min(viewer.count - 1, home.current + 1) * size.width,
      right: -Math.max(0, home.current - 1) * size.width,
    }),
    onEnd: ({ offset, velocity }) => {
      const threshold = size.width * 0.4;
      const step =
        velocity.x <= -0.3 || offset.x <= -threshold
          ? 1
          : velocity.x >= 0.3 || offset.x >= threshold
            ? -1
            : 0;
      pageTo(Math.min(viewer.count - 1, Math.max(0, home.current + step)));
    },
  });
  /** Pages by `step` from a button, the way a flick would. */
  const page = (step: 1 | -1) => () => {
    const to = Math.min(viewer.count - 1, Math.max(0, current() + step));
    pageTo(to);
  };
  const dismiss = useSwipe({
    direction: 'down',
    distance: DISMISS_PX,
    enabled: !zoomed,
    // Held away while "dismissed", then it comes back.
    onSwipe: () => new Promise((resolve) => setTimeout(resolve, DISMISSED_MS)),
  });

  return {
    index,
    zoomed,
    scale,
    x,
    y,
    stripX: strip,
    dismissY: useTransform(dismiss.progress, (value) => value * DISMISS_PX),
    dismissScale: useTransform(dismiss.progress, [0, 1], [1, 0.8]),
    dismissOpacity: useTransform(dismiss.progress, [0, 1], [1, 0]),
    next: page(1),
    previous: page(-1),
  };
}
