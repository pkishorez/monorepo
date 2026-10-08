import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, useMotionValue, type MotionValue } from 'motion/react';

import type { Point, Rect, Size } from '../mind-map/mind-map-layout';
import { clampCamera, openingCamera, zoomAt, type Camera } from './camera';
import {
  createSpaceGestures,
  listenToPointers,
  spreadOf,
  type SpaceListener,
} from './pointer-source';

const glide = { type: 'spring', duration: 0.6, bounce: 0 } as const;

export interface Space {
  readonly x: MotionValue<number>;
  readonly y: MotionValue<number>;
  readonly zoom: MotionValue<number>;
  /** How wide the space is on screen; 0 until it is measured. */
  readonly width: MotionValue<number>;
  /** Attach to the element the space fills. */
  readonly viewportRef: (element: HTMLDivElement | null) => void;
  /** Where the camera is now, where it was last sent, and the screen's size. */
  readonly view: () => {
    readonly camera: Camera;
    readonly goal: Camera;
    readonly viewport: Size;
    /** Whether the reader has moved the camera off the top Story. */
    readonly moved: boolean;
  };
  /**
   * Puts the camera at once where the cards were laid out to be seen:
   * `camera`, inside `bounds`. Until the reader moves it, a resize keeps
   * `top` framed.
   */
  readonly commit: (change: {
    readonly camera: Camera;
    readonly bounds: Rect;
    readonly top: Rect;
    readonly moved: boolean;
  }) => void;
  readonly zoomBy: (factor: number) => void;
}

/**
 * The camera over a bounded, pannable, zoomable space: drag anywhere or
 * wheel to pan, pinch or ctrl/cmd-wheel to zoom.
 */
export function useSpace(reducedMotion: boolean): Space {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const zoom = useMotionValue(1);
  const viewportWidth = useMotionValue(0);
  const [gestures] = useState(createSpaceGestures);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const viewport = useRef<Size>({ width: 0, height: 0 });
  const bounds = useRef<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const opening = useRef<Rect | undefined>(undefined);
  // Where the camera is headed: a glide under way keeps going to it.
  const goal = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  // Until the reader moves the camera, it stays on the top Story.
  const moved = useRef(false);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const current = useCallback(
    (): Camera => ({ x: x.get(), y: y.get(), zoom: zoom.get() }),
    [x, y, zoom],
  );
  const move = useCallback(
    (camera: Camera, animated: boolean) => {
      const next = clampCamera(camera, bounds.current, viewport.current);
      goal.current = next;
      if (!animated || reducedRef.current) {
        x.jump(next.x);
        y.jump(next.y);
        zoom.jump(next.zoom);
        return;
      }
      void animate(x, next.x, glide);
      void animate(y, next.y, glide);
      void animate(zoom, next.zoom, glide);
    },
    [x, y, zoom],
  );
  const local = useCallback(
    (point: Point): Point => {
      const box = element?.getBoundingClientRect();
      return { x: point.x - (box?.left ?? 0), y: point.y - (box?.top ?? 0) };
    },
    [element],
  );
  const byHand = useCallback(
    (camera: Camera) => {
      moved.current = true;
      move(camera, false);
    },
    [move],
  );

  useEffect(() => {
    if (element === null) return;
    const placeOpening = () => {
      if (moved.current || opening.current === undefined) return;
      move(openingCamera(opening.current, viewport.current), false);
    };
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      viewport.current = { width, height };
      viewportWidth.set(width);
      placeOpening();
      move(goal.current, false);
    });
    observer.observe(element);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const delta = Math.max(-50, Math.min(50, event.deltaY));
        const point = local({ x: event.clientX, y: event.clientY });
        byHand(zoomAt(current(), point, Math.exp(-delta * 0.01)));
        return;
      }
      const lines = event.deltaMode === 1 ? 16 : 1;
      const dx =
        (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) *
        lines;
      const dy =
        (event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY) * lines;
      const camera = current();
      byHand({ ...camera, x: camera.x - dx, y: camera.y - dy });
    };
    // Safari reads a trackpad pinch as its own gesture events.
    let safariScale = 1;
    const onSafariStart = (event: Event) => {
      event.preventDefault();
      safariScale = 1;
    };
    const onSafariChange = (event: Event) => {
      event.preventDefault();
      const { scale, clientX, clientY } = event as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      const point = local({ x: clientX, y: clientY });
      byHand(zoomAt(current(), point, scale / safariScale));
      safariScale = scale;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('gesturestart', onSafariStart);
    element.addEventListener('gesturechange', onSafariChange);
    const stopPointers = listenToPointers(element, gestures.sink);
    const removeZone = gestures.addZone(element);
    return () => {
      observer.disconnect();
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onSafariStart);
      element.removeEventListener('gesturechange', onSafariChange);
      stopPointers();
      removeZone();
    };
  }, [element, gestures, move, current, local, byHand]);

  // A gesture that moves the camera with the fingers: pan, and pinch with two.
  const cameraGesture = useCallback((): SpaceListener => {
    let active = false;
    let last: ReturnType<typeof spreadOf>;
    return {
      enabled: () => true,
      directions: () => 'all',
      acts: () => true,
      start: (pointers) => {
        active = false;
        last = spreadOf(pointers);
      },
      // A finger landing or lifting moves the centre: start again from it.
      pointer: (_pointer, pointers) => {
        last = spreadOf(pointers);
        if ((last?.count ?? 0) > 1) active = true;
      },
      direction: () => {
        active = true;
      },
      move: (_pointer, pointers) => {
        const now = spreadOf(pointers);
        if (active && now !== undefined && last !== undefined) {
          const camera = current();
          let next = {
            ...camera,
            x: camera.x + now.x - last.x,
            y: camera.y + now.y - last.y,
          };
          if (now.count > 1 && last.spread > 0) {
            next = zoomAt(next, local(now), now.spread / last.spread);
          }
          byHand(next);
        }
        last = now;
      },
      end: (_pointers, end) => {
        if (active) end.preventClick();
        active = false;
        last = undefined;
      },
    };
  }, [current, local, byHand]);

  useEffect(() => {
    if (element === null) return;
    return gestures.addGesture(element, cameraGesture());
  }, [element, gestures, cameraGesture]);

  return useMemo(
    () => ({
      x,
      y,
      zoom,
      width: viewportWidth,
      viewportRef: setElement,
      view: () => ({
        camera: current(),
        goal: goal.current,
        viewport: viewport.current,
        moved: moved.current,
      }),
      commit: (change) => {
        bounds.current = change.bounds;
        opening.current = change.top;
        if (change.moved) moved.current = true;
        move(change.camera, false);
      },
      zoomBy: (factor) => {
        const { width, height } = viewport.current;
        moved.current = true;
        move(
          zoomAt(goal.current, { x: width / 2, y: height / 2 }, factor),
          true,
        );
      },
    }),
    [x, y, zoom, viewportWidth, move, current],
  );
}
