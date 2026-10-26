// oxlint-disable-next-line no-restricted-imports -- a prototype: the space listens to the pointer and the wheel itself.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from '@kestack/web-platform/ui/components/motion';

/*
 * The space the cards sit in, after DevTools' canvas: drag anywhere to pan,
 * the wheel or a pinch to zoom at the pointer, Shift and the wheel to pan
 * sideways. The
 * camera glides to what it is asked to show, and jumps with reduced motion.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

const LIMITS = { min: 0.2, max: 2 } as const;
const glide = { type: 'spring', duration: 0.7, bounce: 0 } as const;
/** The cards' own spring: a camera that keeps a card in place moves with it. */
export const CARD_SPRING = {
  type: 'spring',
  duration: 0.5,
  bounce: 0,
} as const;

const clampZoom = (zoom: number) =>
  Math.min(LIMITS.max, Math.max(LIMITS.min, zoom));

/** Zooms by `factor`, keeping the point under `at` where it is. */
const zoomAt = (
  camera: Camera,
  at: { readonly x: number; readonly y: number },
  factor: number,
): Camera => {
  const zoom = clampZoom(camera.zoom * factor);
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: at.x - (at.x - camera.x) * ratio,
    y: at.y - (at.y - camera.y) * ratio,
  };
};

export const unionOf = (rects: ReadonlyArray<Rect>): Rect | undefined => {
  if (rects.length === 0) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export interface Space {
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  readonly zoom: MotionValue<number>;
  readonly ref: (element: HTMLDivElement | null) => void;
  /**
   * Glides to show `rect` whole, centred, never closer than `zoom`. One
   * that would shrink past `least` is shown at `least` from its top.
   */
  readonly show: (
    rect: Rect,
    options?: { readonly zoom?: number; readonly least?: number },
  ) => void;
  /**
   * Keeps a card where it is on screen as the layout moves it `by` in the
   * space, moving with it on the cards' spring, then, given its `rect`,
   * pans as little as it takes to bring it whole on screen: its top left
   * corner first, so one too big keeps that corner in view.
   */
  readonly keep: (
    by: { readonly x: number; readonly y: number },
    rect?: Rect,
  ) => void;
  /** Brings `rect` to the middle of the screen at the same zoom; one too tall, its top near the top. */
  readonly center: (rect: Rect) => void;
  readonly zoomBy: (factor: number) => void;
  /** Whether the space has a size yet: nothing can be shown before. */
  readonly ready: boolean;
}

export function useSpace(): Space {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const zoom = useMotionValue(1);
  const reduced = useReducedMotion() ?? false;
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const size = useRef({ width: 0, height: 0 });
  const still = useRef(reduced);
  still.current = reduced;

  const now = (): Camera => ({ x: x.get(), y: y.get(), zoom: zoom.get() });
  // Where the camera is headed: a move under way keeps going to it.
  const goal = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const move = (camera: Camera, animated: boolean | typeof CARD_SPRING) => {
    goal.current = camera;
    if (!animated || still.current) {
      x.jump(camera.x);
      y.jump(camera.y);
      zoom.jump(camera.zoom);
      return;
    }
    const how = animated === true ? glide : animated;
    void animate(x, camera.x, how);
    void animate(y, camera.y, how);
    void animate(zoom, camera.zoom, how);
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  useEffect(() => {
    if (element === null) return;
    const local = (clientX: number, clientY: number) => {
      const box = element.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };
    const byHand = (camera: Camera) => {
      x.stop();
      y.stop();
      zoom.stop();
      moveRef.current(camera, false);
    };

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      size.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      setReady(size.current.width > 0);
    });
    observer.observe(element);

    const onWheel = (event: WheelEvent) => {
      // What scrolls on its own, as a card's JSON, scrolls while it can.
      const inner = (event.target as Element).closest<HTMLElement>(
        '[data-space-scroll]',
      );
      if (
        inner &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.deltaY < 0
          ? inner.scrollTop > 0
          : inner.scrollTop + inner.clientHeight < inner.scrollHeight - 1)
      )
        return;
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 16 : 1;
      const at = local(event.clientX, event.clientY);
      // Shift and the wheel pans, as a sideways scroll would.
      if (event.shiftKey) {
        const camera = now();
        byHand({
          ...camera,
          x: camera.x - (event.deltaX || event.deltaY) * lines,
        });
        return;
      }
      // The wheel zooms at the pointer: a pinch, as Ctrl and the wheel,
      // in fine steps; a wheel notch, a large step, by a gentler share of it.
      const pinch = event.ctrlKey || event.metaKey;
      const delta = Math.max(-60, Math.min(60, event.deltaY * lines));
      byHand(zoomAt(now(), at, Math.exp(-delta * (pinch ? 0.01 : 0.0025))));
    };

    // Safari reads a trackpad pinch as gesture events of its own.
    let scale = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      scale = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & {
        readonly scale: number;
        readonly clientX: number;
        readonly clientY: number;
      };
      byHand(
        zoomAt(
          now(),
          local(gesture.clientX, gesture.clientY),
          gesture.scale / scale,
        ),
      );
      scale = gesture.scale;
    };

    // Pointers: one drags, two pinch. A press that moved is not a click.
    const down = new Map<number, { x: number; y: number }>();
    let last: { x: number; y: number; spread: number } | undefined;
    let moved = false;
    const spread = () => {
      const all = [...down.values()];
      const cx = all.reduce((sum, p) => sum + p.x, 0) / all.length;
      const cy = all.reduce((sum, p) => sum + p.y, 0) / all.length;
      const reach =
        all.length < 2
          ? 0
          : all.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) /
            all.length;
      return { x: cx, y: cy, spread: reach };
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if ((event.target as Element).closest('[data-space-ignore]')) return;
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (down.size === 1) moved = false;
      last = spread();
    };
    const onMove = (event: PointerEvent) => {
      if (!down.has(event.pointerId)) return;
      down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const at = spread();
      if (!last) return (last = at);
      if (
        !moved &&
        Math.hypot(at.x - last.x, at.y - last.y) < 4 &&
        down.size < 2
      )
        return;
      moved = true;
      let camera = now();
      camera = {
        ...camera,
        x: camera.x + at.x - last.x,
        y: camera.y + at.y - last.y,
      };
      if (down.size > 1 && last.spread > 0)
        camera = zoomAt(camera, local(at.x, at.y), at.spread / last.spread);
      byHand(camera);
      last = at;
    };
    const onUp = (event: PointerEvent) => {
      if (!down.delete(event.pointerId)) return;
      last = down.size > 0 ? spread() : undefined;
    };
    const onClick = (event: MouseEvent) => {
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('gesturestart', onGestureStart);
    element.addEventListener('gesturechange', onGestureChange);
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('click', onClick, { capture: true });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [element, x, y, zoom]);

  return useMemo(
    () => ({
      x,
      y,
      zoom,
      ref: setElement,
      ready,
      show: (rect, options = {}) => {
        const { width, height } = size.current;
        if (width === 0) return;
        const margin = width < 600 ? 16 : 72;
        const fit = Math.min(
          (width - margin * 2) / Math.max(1, rect.width),
          (height - margin * 2) / Math.max(1, rect.height),
        );
        const least = options.least ?? LIMITS.min;
        const next = clampZoom(
          Math.max(least, Math.min(options.zoom ?? 1, fit)),
        );
        const tall = rect.height * next > height - margin * 2;
        moveRef.current(
          {
            zoom: next,
            x: width / 2 - (rect.x + rect.width / 2) * next,
            y: tall
              ? margin - rect.y * next
              : height / 2 - (rect.y + rect.height / 2) * next,
          },
          true,
        );
      },
      keep: (by, rect) => {
        const { width, height } = size.current;
        if (width === 0) return;
        const pad = width < 600 ? 12 : 24;
        const from = goal.current;
        const camera = {
          zoom: from.zoom,
          x: from.x - by.x * from.zoom,
          y: from.y - by.y * from.zoom,
        };
        const axis = (
          position: number,
          start: number,
          length: number,
          room: number,
        ) => {
          const near = start * camera.zoom + position;
          const far = near + length * camera.zoom;
          let shift = 0;
          if (far > room - pad) shift = room - pad - far;
          // The top left corner wins over the far edge.
          if (near + shift < pad) shift = pad - near;
          return position + shift;
        };
        const next = rect
          ? {
              zoom: camera.zoom,
              x: axis(camera.x, rect.x, rect.width, width),
              y: axis(camera.y, rect.y, rect.height, height),
            }
          : camera;
        if (Math.abs(next.x - from.x) < 1 && Math.abs(next.y - from.y) < 1)
          return;
        moveRef.current(next, CARD_SPRING);
      },
      center: (rect) => {
        const { width, height } = size.current;
        if (width === 0) return;
        const { zoom: z } = goal.current;
        const pad = width < 600 ? 12 : 24;
        const tall = rect.height * z > height - pad * 2;
        moveRef.current(
          {
            zoom: z,
            x: width / 2 - (rect.x + rect.width / 2) * z,
            y: tall
              ? pad - rect.y * z
              : height / 2 - (rect.y + rect.height / 2) * z,
          },
          CARD_SPRING,
        );
      },
      zoomBy: (factor) => {
        const { width, height } = size.current;
        moveRef.current(
          zoomAt(now(), { x: width / 2, y: height / 2 }, factor),
          true,
        );
      },
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `now` reads the motion values, which never change.
    [x, y, zoom, ready],
  );
}
