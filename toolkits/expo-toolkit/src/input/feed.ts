import type { PointerSink } from '@kstackz/use-gesture';

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
 * the screen, at `clock()` ms, landed on `target`. It never decides who owns
 * a touch; the core reads the Direction once a finger has moved SLOP px.
 */
export const createFeed = <Target>(
  sink: PointerSink<Target>,
  target: Target,
  clock: () => number,
) => {
  const each =
    (send: (sample: Parameters<PointerSink<Target>['move']>[0]) => unknown) =>
    (event: TouchEvent) => {
      const t = clock();
      for (const touch of event.changedTouches) {
        send({
          id: touch.id,
          x: touch.absoluteX,
          y: touch.absoluteY,
          t,
          target,
        });
      }
    };
  return {
    down: each(sink.down),
    move: each(sink.move),
    up: each(sink.up),
    /** Gesture Handler took the touch away: every finger lifts where it is. */
    cancelled: () => sink.cancelAll(clock()),
  };
};
