import type { PointerSample, PointerSink } from '@kstackz/use-gesture';
import type { Point } from './zones';

/** One finger as Gesture Handler reports it: its id and where it is on screen. */
type Touch = {
  readonly id: number;
  readonly absoluteX: number;
  readonly absoluteY: number;
};

/** The part of a Gesture Handler touch event the feed reads. */
type TouchEvent = { readonly changedTouches: ReadonlyArray<Touch> };

/**
 * Turns Gesture Handler's touch events, finger by finger, into the samples
 * use-gesture's core reads: each changed finger by its id, where it is on
 * the screen, at `clock()` ms as it arrives. What a finger landed on is
 * where it is: the point the Zone Tree finds its zone by. A landing reaches
 * the core only after `later` runs, with every event after it waiting in
 * order behind it, so the zones under the finger, whose own gestures hear
 * the same touch in no fixed order, have told where it landed first. It
 * never decides who owns a touch; the core reads the Direction once a
 * finger has moved SLOP px.
 */
export const createFeed = (
  sink: PointerSink<Point>,
  clock: () => number,
  later: (run: () => void) => void = (run) => run(),
) => {
  let waiting: Array<() => void> | undefined;
  const flush = () => {
    const runs = waiting ?? [];
    waiting = undefined;
    for (const run of runs) run();
  };
  const send = (run: () => void) => {
    if (waiting === undefined) run();
    else waiting.push(run);
  };
  const samples = (event: TouchEvent): ReadonlyArray<PointerSample<Point>> => {
    const t = clock();
    return event.changedTouches.map((touch) => {
      const x = touch.absoluteX;
      const y = touch.absoluteY;
      return { id: touch.id, x, y, t, target: { x, y } };
    });
  };
  const each =
    (to: (sample: PointerSample<Point>) => unknown) => (event: TouchEvent) => {
      const all = samples(event);
      send(() => {
        for (const sample of all) to(sample);
      });
    };
  const move = each(sink.move);
  const up = each(sink.up);
  return {
    down: (event: TouchEvent) => {
      const all = samples(event);
      const run = () => {
        for (const sample of all) sink.down(sample);
      };
      if (waiting !== undefined) {
        waiting.push(run);
        return;
      }
      waiting = [run];
      later(flush);
    },
    move,
    up,
    /** Runs `run` once every event before it has reached the core. */
    after: send,
    /** Gesture Handler took the touch away: every finger lifts where it is. */
    cancelled: () => {
      const t = clock();
      send(() => sink.cancelAll(t));
    },
  };
};
