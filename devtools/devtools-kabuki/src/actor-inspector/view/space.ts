import { useEffect, useMemo, useRef, useState } from 'react';
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';

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

const CONTROLS = 56;
const glide = { type: 'spring', duration: 0.7, bounce: 0 } as const;

export const CARD_SPRING = {
  type: 'spring',
  duration: 0.5,
  bounce: 0,
} as const;

const HELD_BY_ITSELF =
  'input, textarea, select, [contenteditable="true"], [data-space-ignore]';

const scrolls = (style: string) => style === 'auto' || style === 'scroll';

const scrollerOf = (
  from: Element,
  until: Element,
  event: {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly shiftKey: boolean;
  },
): boolean => {
  const sideways = event.shiftKey && event.deltaX === 0;
  const wheel = sideways
    ? { deltaX: event.deltaY, deltaY: 0 }
    : { deltaX: event.deltaX, deltaY: event.deltaY };
  for (
    let box: Element | null = from;
    box !== null && box !== until;
    box = box.parentElement
  ) {
    if (!(box instanceof HTMLElement)) continue;
    const style = getComputedStyle(box);
    const down =
      wheel.deltaY !== 0 &&
      scrolls(style.overflowY) &&
      (wheel.deltaY < 0
        ? box.scrollTop > 0
        : box.scrollTop + box.clientHeight < box.scrollHeight - 1);
    const across =
      wheel.deltaX !== 0 &&
      scrolls(style.overflowX) &&
      (wheel.deltaX < 0
        ? box.scrollLeft > 0
        : box.scrollLeft + box.clientWidth < box.scrollWidth - 1);
    if (down || across) return true;
  }
  return false;
};

const clampZoom = (zoom: number) =>
  Math.min(LIMITS.max, Math.max(LIMITS.min, zoom));

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

interface Space {
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  readonly zoom: MotionValue<number>;
  readonly ref: (element: HTMLDivElement | null) => void;
  readonly show: (
    rect: Rect,
    options?: { readonly least?: number; readonly jump?: boolean },
  ) => void;
  readonly keep: (rect: Rect) => void;
  readonly zoomBy: (factor: number) => void;
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
      const was = size.current;
      size.current = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      if (was.width > 0 && size.current.width > 0) {
        const camera = goal.current;
        moveRef.current(
          {
            ...camera,
            x: camera.x + (size.current.width - was.width) / 2,
            y: camera.y + (size.current.height - was.height) / 2,
          },
          false,
        );
      }
      setReady(size.current.width > 0);
    });
    observer.observe(element);

    const onWheel = (event: WheelEvent) => {
      const zooming = event.ctrlKey || event.metaKey;
      if (!zooming && scrollerOf(event.target as Element, element, event))
        return;
      event.preventDefault();
      if (!zooming) return;
      const lines = event.deltaMode === 1 ? 16 : 1;
      const pinch =
        event.ctrlKey &&
        !event.metaKey &&
        event.deltaMode === 0 &&
        Math.abs(event.deltaY) < 50;
      const delta = Math.max(-60, Math.min(60, event.deltaY * lines));
      byHand(
        zoomAt(
          now(),
          local(event.clientX, event.clientY),
          Math.exp(-delta * (pinch ? 0.01 : 0.0025)),
        ),
      );
    };
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
      if ((event.target as Element).closest(HELD_BY_ITSELF)) return;
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
        const next = clampZoom(Math.max(least, Math.min(1, fit)));
        const tall = rect.height * next > height - margin * 2;
        const wide = rect.width * next > width - margin * 2;
        moveRef.current(
          {
            zoom: next,
            x: wide
              ? margin - rect.x * next
              : width / 2 - (rect.x + rect.width / 2) * next,
            y: tall
              ? margin - rect.y * next
              : height / 2 - (rect.y + rect.height / 2) * next,
          },
          !options.jump,
        );
      },
      keep: (rect) => {
        const { width, height } = size.current;
        if (width === 0) return;
        const pad = width < 600 ? 12 : 24;
        const from = goal.current;
        const axis = (
          position: number,
          start: number,
          length: number,
          room: number,
          end = pad,
        ) => {
          const near = start * from.zoom + position;
          const far = near + length * from.zoom;
          let shift = 0;
          if (far > room - end) shift = room - end - far;
          if (near + shift < pad) shift = pad - near;
          return position + shift;
        };
        const next = {
          zoom: from.zoom,
          x: axis(from.x, rect.x, rect.width, width, CONTROLS),
          y: axis(from.y, rect.y, rect.height, height),
        };
        if (Math.abs(next.x - from.x) < 1 && Math.abs(next.y - from.y) < 1)
          return;
        moveRef.current(next, CARD_SPRING);
      },
      zoomBy: (factor) => {
        const { width, height } = size.current;
        moveRef.current(
          zoomAt(now(), { x: width / 2, y: height / 2 }, factor),
          true,
        );
      },
    }),
    [x, y, zoom, ready],
  );
}
