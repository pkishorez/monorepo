import { elapsed, horizontal } from './geometry';
import { SLOP_PX } from './thresholds';
import type { Recognizer, Track } from './types';
import { createVelocityTracker } from './velocity';
import { end, FAIL, track, WAIT } from './verdicts';

/**
 * One finger dragged sideways. Decided once it passes the slop: sideways
 * first and it is ours, up or down first and the page scrolls. Once going, a
 * second finger is ignored.
 */
export const pan: Recognizer = {
  kind: 'pan',
  continuous: true,
  requiresFailureOf: [],
  fingers: ['acting'],
  start: () => {
    let press: Track | undefined;
    let certain = false;
    const velocity = createVelocityTracker();
    return (frame) => {
      const input = frame.input;
      if (input === undefined) return WAIT;
      if (input.type === 'down') {
        if (press !== undefined) return certain ? WAIT : FAIL;
        press = input.track;
        velocity.add(press.down.x, press.down.t);
        return WAIT;
      }
      if (press === undefined || input.track.id !== press.id) return WAIT;
      const at = input.track.current;
      const dx = at.x - press.down.x;
      const dy = at.y - press.down.y;
      velocity.add(at.x, at.t);
      if (!certain) {
        if (input.type === 'up') return FAIL;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP_PX) return WAIT;
        if (Math.abs(dy) >= Math.abs(dx)) return FAIL;
        certain = true;
      }
      const event = {
        kind: 'pan' as const,
        x: at.x,
        y: at.y,
        duration: elapsed(frame, press.down),
        ...horizontal(dx, frame.width, velocity.velocity()),
      };
      return input.type === 'up' ? end(event) : track(event);
    };
  },
};
