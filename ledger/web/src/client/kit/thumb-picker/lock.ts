import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { useRef } from 'react';
import type { Point } from './walk.ts';

// The thumb lands on this part of the screen's width, from the left.
const THUMB_PART = 0.5;
// How far, in px, the thumb may drift and still be still.
const STILL = 14;

/**
 * The Thumb Lock of the nearest Gesture Zone: the left thumb resting still
 * while another finger moves. It reports the Lock as it holds, the other
 * finger as it moves, from where it landed, and the end: lifted, when the
 * finger lifts first, or called off, when the thumb does. The thumb may
 * stay for another swipe. A swipe of one finger is left to
 * the zones and the browser, so the page still scrolls.
 */
export function useThumbLock(props: {
  readonly enabled: boolean;
  readonly onLock: () => void;
  readonly onMove: (finger: Point) => void;
  readonly onEnd: (lifted: boolean) => void;
}) {
  const thumb = useRef<Pointer>(undefined);
  const mover = useRef<Pointer>(undefined);
  const stop = useRef<Array<() => void>>([]);
  // Two fingers own the touch at its first movement; one is left alone.
  const directions = useRef<'all' | []>([]);
  const latest = useRef(props);
  latest.current = props;

  const release = (lifted: boolean) => {
    if (mover.current === undefined) return;
    for (const off of stop.current) off();
    stop.current = [];
    mover.current = undefined;
    directions.current = [];
    latest.current.onEnd(lifted);
  };

  const follow = (finger: Pointer) => {
    const moved = () =>
      latest.current.onMove({ x: finger.dx.get(), y: finger.dy.get() });
    stop.current.push(
      finger.dx.on('change', moved),
      finger.dy.on('change', moved),
    );
  };

  useGesture({
    enabled: props.enabled,
    get directions() {
      return directions.current;
    },
    onStart: (pointers) => {
      const [first] = pointers.values();
      thumb.current =
        first !== undefined && first.start.x <= window.innerWidth * THUMB_PART
          ? first
          : undefined;
    },
    onPointer: (pointer) => {
      const held = thumb.current;
      if (pointer.end !== undefined) {
        if (pointer.id === mover.current?.id) release(true);
        // The thumb lifting first calls the swipe off.
        else if (pointer.id === held?.id) {
          thumb.current = undefined;
          release(false);
        }
        return;
      }
      if (held === undefined || pointer.id === held.id || mover.current) return;
      // The thumb is still: the Lock holds from this finger's landing.
      if (Math.hypot(held.dx.get(), held.dy.get()) > STILL) return;
      mover.current = pointer;
      directions.current = 'all';
      follow(pointer);
      latest.current.onLock();
    },
    onEnd: () => {
      thumb.current = undefined;
      release(false);
    },
  });
}
