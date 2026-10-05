import { type Pointer, useGesture } from '@kstackz/use-gesture/core';
import { useRef } from 'react';
import { read, type Reading, type Way } from './recognize.ts';

/** What happened, for sound and touch to follow. */
export type ThumbFeedback = 'lock' | 'wrong';

/** A swipe going its way: how far, in px, the finger is from where it landed. */
type Swipe = { readonly way: Way; readonly dx: number; readonly dy: number };

// The thumb lands on this part of the screen's width, from the left.
const THUMB_PART = 0.5;
// How far, in px, the thumb may drift and still be still.
const STILL = 14;

/**
 * The Thumb Lock of the nearest Gesture Zone: the left thumb resting still
 * while another finger swipes turns that swipe into a Command. It shows
 * nothing itself: it reports the swipe live as it goes its way, so the
 * caller can show at the top where letting go will lead, and once more as
 * the finger lifts, for the caller to act on. A way that does not work
 * here is a Wrong Way at once. The thumb may stay for another swipe. A
 * swipe of one finger is left to the zones and the browser, so the page
 * still scrolls.
 */
export function ThumbLock(props: {
  readonly works: Readonly<Record<Way, boolean>>;
  /** The swipe as it moves: undefined until it has a way, or on a Wrong one. */
  readonly onSwipe: (swipe: Swipe | undefined) => void;
  /** The swipe ended: as the finger lifted going its way, else undefined. */
  readonly onLift: (swipe: Swipe | undefined) => void;
  readonly onFeedback?: (feedback: ThumbFeedback) => void;
  readonly enabled?: boolean;
}) {
  const thumb = useRef<Pointer>(undefined);
  const mover = useRef<Pointer>(undefined);
  const reading = useRef<Reading>({ kind: 'undecided' });
  const swipe = useRef<Swipe>(undefined);
  const stop = useRef<Array<() => void>>([]);
  // Two fingers own the touch at its first movement; one is left alone.
  const directions = useRef<'all' | []>([]);
  const latest = useRef(props);
  latest.current = props;

  const unwatch = () => {
    for (const off of stop.current) off();
    stop.current = [];
  };

  const release = (lifted: boolean) => {
    if (mover.current === undefined) return;
    const last = lifted ? swipe.current : undefined;
    unwatch();
    mover.current = undefined;
    reading.current = { kind: 'undecided' };
    swipe.current = undefined;
    directions.current = [];
    latest.current.onLift(last);
  };

  const follow = (finger: Pointer) => {
    const moved = () => {
      const before = reading.current;
      const dx = finger.dx.get();
      const dy = finger.dy.get();
      const next = read(before, dx, dy, (way) => latest.current.works[way]);
      reading.current = next;
      if (next.kind === 'wrong' && before.kind !== 'wrong') {
        latest.current.onFeedback?.('wrong');
      }
      swipe.current =
        next.kind === 'going' ? { way: next.way, dx, dy } : undefined;
      latest.current.onSwipe(swipe.current);
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
      mover.current = pointer;
      directions.current = 'all';
      reading.current = { kind: 'undecided' };
      follow(pointer);
      latest.current.onFeedback?.('lock');
    },
    onEnd: () => {
      thumb.current = undefined;
      release(false);
    },
  });

  return null;
}
