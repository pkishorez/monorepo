import { distance, elapsed, midpoint, trackOf } from './geometry';
import { createPairGate } from './pair';
import { PINCH_START_PX } from './thresholds';
import type { Recognizer } from './types';
import { end, FAIL, track, WAIT } from './verdicts';

/**
 * Two fingers spreading or closing. `scale` is their distance over the
 * distance when the second landed. Waits out a hold-swipe, whose swiping
 * finger also changes the spread.
 */
export const pinch: Recognizer = {
  kind: 'pinch',
  continuous: true,
  requiresFailureOf: ['hold-swipe'],
  start: () => {
    const gate = createPairGate();
    let certain = false;
    return (frame) => {
      const reading = gate(frame);
      if (reading.type === 'fail') return FAIL;
      if (reading.type === 'waiting') return WAIT;
      const { ids, start, since } = reading.pair;
      const input = frame.input;
      if (input === undefined || !ids.includes(input.track.id)) return WAIT;
      const a = trackOf(frame, ids[0]);
      const b = trackOf(frame, ids[1]);
      if (a === undefined || b === undefined) return FAIL;
      const from = Math.max(distance(start[0], start[1]), 1);
      const spread = distance(a.current, b.current);
      if (!certain) {
        if (input.type === 'up') return FAIL;
        if (Math.abs(spread - from) < PINCH_START_PX) return WAIT;
        certain = true;
      }
      const center = midpoint(a.current, b.current);
      const event = {
        kind: 'pinch' as const,
        x: center.x,
        y: center.y,
        duration: elapsed(frame, since),
        scale: spread / from,
      };
      return input.type === 'up' ? end(event) : track(event);
    };
  },
};
