import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { useMotionValue } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass } from './compass.tsx';
import { read, type Reading, type Way } from './recognize.ts';

/** One arm of the Compass: the Command a way runs, and whether it works here. */
export type ThumbCommand = {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly works: boolean;
};

/** What happened, for sound and touch to follow. */
export type ThumbFeedback = 'lock' | 'arm' | 'disarm' | 'wrong' | 'run';

// The thumb lands on this part of the screen's width, from the left.
const THUMB_PART = 0.5;
// How far, in px, the thumb may drift and still be still.
const STILL = 14;
// How long, in ms, the Compass shows a Command running before it goes.
const RAN = 220;

type Lock = {
  readonly thumb: { readonly x: number; readonly y: number };
  readonly origin: { readonly x: number; readonly y: number };
  readonly reading: Reading;
  /** The Command ran: the Compass flings to its arm, then goes. */
  readonly ran?: boolean;
};

/**
 * The Thumb Lock of the nearest Gesture Zone: the left thumb resting still
 * while another finger swipes turns that swipe into a Command, shown live
 * on a Compass under the finger. Lifting the finger once it is armed runs
 * the Command; the thumb may stay for another. A swipe of one finger is
 * left to the zones and the browser, so the page still scrolls.
 */
export function ThumbLock(props: {
  readonly commands: Readonly<Record<Way, ThumbCommand>>;
  readonly onCommand: (way: Way) => void;
  readonly onFeedback?: (feedback: ThumbFeedback, way?: Way) => void;
  readonly enabled?: boolean;
}) {
  const [lock, setLock] = useState<Lock>();
  const dx = useMotionValue(0);
  const dy = useMotionValue(0);
  const thumb = useRef<Pointer>(undefined);
  const mover = useRef<Pointer>(undefined);
  const reading = useRef<Reading>({ kind: 'undecided' });
  const stop = useRef<Array<() => void>>([]);
  // Two fingers own the touch at its first movement; one is left alone.
  const directions = useRef<'all' | []>([]);
  const latest = useRef(props);
  latest.current = props;

  const feedback = (kind: ThumbFeedback, way?: Way) =>
    latest.current.onFeedback?.(kind, way);

  const unwatch = () => {
    for (const off of stop.current) off();
    stop.current = [];
  };

  // While set, the Compass is showing a Command that ran.
  const shown = useRef<ReturnType<typeof setTimeout>>(undefined);
  const release = (run: boolean) => {
    const now = reading.current;
    unwatch();
    mover.current = undefined;
    reading.current = { kind: 'undecided' };
    directions.current = [];
    if (run && now.kind === 'going' && now.armed) {
      setLock((lock) => lock && { ...lock, reading: now, ran: true });
      shown.current = setTimeout(() => {
        shown.current = undefined;
        setLock(undefined);
      }, RAN);
      feedback('run', now.way);
      latest.current.onCommand(now.way);
    } else if (shown.current === undefined) setLock(undefined);
  };

  const follow = (finger: Pointer) => {
    const moved = () => {
      dx.set(finger.dx.get());
      dy.set(finger.dy.get());
      const before = reading.current;
      const next = read(
        before,
        finger.dx.get(),
        finger.dy.get(),
        (way) => latest.current.commands[way].works,
      );
      reading.current = next;
      if (next.kind === 'wrong' && before.kind !== 'wrong') {
        feedback('wrong', next.way);
      }
      const armed = (r: Reading) => r.kind === 'going' && r.armed;
      if (armed(next) && !armed(before))
        feedback('arm', next.kind === 'going' ? next.way : undefined);
      if (!armed(next) && armed(before)) feedback('disarm');
      if (
        next.kind !== before.kind ||
        (next.kind !== 'undecided' &&
          before.kind !== 'undecided' &&
          next.way !== before.way) ||
        armed(next) !== armed(before)
      ) {
        setLock((lock) => lock && { ...lock, reading: next });
      }
    };
    stop.current.push(
      finger.dx.on('change', moved),
      finger.dy.on('change', moved),
    );
  };

  useGesture({
    enabled: props.enabled !== false,
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
        else if (pointer.id === held?.id) {
          thumb.current = undefined;
          release(true);
        }
        return;
      }
      if (held === undefined || pointer.id === held.id || mover.current) return;
      // The thumb is still: the Lock holds from this finger's landing.
      if (Math.hypot(held.dx.get(), held.dy.get()) > STILL) return;
      clearTimeout(shown.current);
      shown.current = undefined;
      mover.current = pointer;
      directions.current = 'all';
      reading.current = { kind: 'undecided' };
      dx.set(0);
      dy.set(0);
      follow(pointer);
      setLock({
        thumb: {
          x: held.start.x + held.dx.get(),
          y: held.start.y + held.dy.get(),
        },
        origin: { x: pointer.start.x, y: pointer.start.y },
        reading: reading.current,
      });
      feedback('lock');
    },
    onEnd: () => {
      thumb.current = undefined;
      release(false);
    },
  });

  useEffect(() => () => clearTimeout(shown.current), []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <Compass lock={lock} commands={props.commands} dx={dx} dy={dy} />,
    document.body,
  );
}
