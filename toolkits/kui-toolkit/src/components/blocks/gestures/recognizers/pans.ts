import { elapsed, horizontal, midpoint, trackOf } from './geometry';
import { createPairGate } from './pair';
import { SLOP_PX, TWO_FINGER_START_PX } from './thresholds';
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

/**
 * Two fingers dragged sideways together, measured at their midpoint. Two
 * fingers going up or down are left alone: there is no two-finger vertical.
 * Waits out a hold-swipe, which starts the same way.
 */
export const twoFingerPan: Recognizer = {
  kind: 'two-finger-pan',
  continuous: true,
  requiresFailureOf: ['hold-swipe'],
  start: () => {
    const gate = createPairGate();
    let certain = false;
    const velocity = createVelocityTracker();
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
      const from = midpoint(start[0], start[1]);
      const at = midpoint(a.current, b.current);
      const dx = at.x - from.x;
      const dy = at.y - from.y;
      if (input.type === 'down') velocity.add(from.x, frame.t);
      else velocity.add(at.x, frame.t);
      if (!certain) {
        if (input.type === 'up') return FAIL;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < TWO_FINGER_START_PX) {
          return WAIT;
        }
        if (Math.abs(dy) >= Math.abs(dx)) return FAIL;
        const adx = a.current.x - start[0].x;
        const bdx = b.current.x - start[1].x;
        // Fingers going opposite ways are spreading or closing: a pinch.
        if (
          Math.sign(adx) !== Math.sign(bdx) &&
          Math.min(Math.abs(adx), Math.abs(bdx)) > SLOP_PX
        ) {
          return FAIL;
        }
        certain = true;
      }
      const event = {
        kind: 'two-finger-pan' as const,
        x: at.x,
        y: at.y,
        duration: elapsed(frame, since),
        ...horizontal(dx, frame.width, velocity.velocity()),
      };
      return input.type === 'up' ? end(event) : track(event);
    };
  },
};
