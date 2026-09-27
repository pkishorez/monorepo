import { elapsed } from './geometry';
import { LONG_PRESS_MS, SLOP_PX } from './thresholds';
import type { Recognizer, Track } from './types';
import { end, FAIL, track, WAIT, waitUntil } from './verdicts';

/** One finger held in place: begins after half a second, ends when it lifts. */
export const longPress: Recognizer = {
  kind: 'long-press',
  continuous: true,
  requiresFailureOf: [],
  start: () => {
    let press: Track | undefined;
    let certain = false;
    return (frame) => {
      const input = frame.input;
      if (input?.type === 'down') {
        if (press === undefined) press = input.track;
        else return certain ? WAIT : FAIL;
      }
      if (press === undefined) return WAIT;
      const own = input?.track.id === press.id ? input.track : undefined;
      const lifted = own !== undefined && input?.type === 'up';
      const current =
        own ?? frame.pointers.find((pointer) => pointer.id === press?.id);
      if (!certain) {
        if (current === undefined || current.travel > SLOP_PX) return FAIL;
        const deadline = press.down.t + LONG_PRESS_MS;
        if (frame.t < deadline) return lifted ? FAIL : waitUntil(deadline);
        certain = true;
      } else if (own === undefined) {
        return WAIT;
      }
      const at = (current ?? press).current;
      const event = {
        kind: 'long-press' as const,
        x: at.x,
        y: at.y,
        duration: elapsed(frame, press.down),
      };
      return lifted ? end(event) : track(event);
    };
  },
};
