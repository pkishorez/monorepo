import { distance, elapsed, midpoint } from './geometry';
import { createPairGate } from './pair';
import {
  DOUBLE_TAP_DISTANCE_PX,
  DOUBLE_TAP_GAP_MS,
  SLOP_PX,
  TAP_MAX_MS,
} from './thresholds';
import type { Recognizer, Sample, Track, Verdict } from './types';
import { end, FAIL, WAIT, waitUntil } from './verdicts';

/** One finger down and up, quickly and in place. Waits out a double tap. */
export const tap: Recognizer = {
  kind: 'tap',
  continuous: false,
  requiresFailureOf: ['double-tap'],
  start: () => {
    let press: Track | undefined;
    // Once recognized it stays recognized while a double tap is decided.
    let result: Verdict | undefined;
    return (frame) => {
      if (result !== undefined) return result;
      const input = frame.input;
      if (input?.type === 'down') {
        if (press !== undefined) return FAIL;
        press = input.track;
      }
      if (press === undefined) return WAIT;
      const deadline = press.down.t + TAP_MAX_MS;
      if (frame.t >= deadline) return FAIL;
      if (input !== undefined && input.track.id === press.id) {
        if (input.track.travel > SLOP_PX) return FAIL;
        if (input.type === 'up') {
          const at = input.track.current;
          result = end({
            kind: 'tap',
            x: at.x,
            y: at.y,
            duration: elapsed(frame, press.down),
          });
          return result;
        }
      }
      return waitUntil(deadline);
    };
  },
};

/** Two taps close together in time and place. */
export const doubleTap: Recognizer = {
  kind: 'double-tap',
  continuous: false,
  requiresFailureOf: [],
  start: () => {
    let first: Track | undefined;
    let firstUp: Sample | undefined;
    let second: Track | undefined;
    return (frame) => {
      const input = frame.input;
      if (input?.type === 'down') {
        if (first === undefined) first = input.track;
        else if (firstUp === undefined || second !== undefined) return FAIL;
        else if (
          input.track.down.t - firstUp.t > DOUBLE_TAP_GAP_MS ||
          distance(input.track.down, first.down) > DOUBLE_TAP_DISTANCE_PX
        ) {
          return FAIL;
        } else second = input.track;
      }
      if (first === undefined) return WAIT;
      if (firstUp !== undefined && second === undefined) {
        const deadline = firstUp.t + DOUBLE_TAP_GAP_MS;
        return frame.t >= deadline ? FAIL : waitUntil(deadline);
      }
      const press = second ?? first;
      const deadline = press.down.t + TAP_MAX_MS;
      if (frame.t >= deadline) return FAIL;
      if (input !== undefined && input.track.id === press.id) {
        if (input.track.travel > SLOP_PX) return FAIL;
        if (input.type === 'up') {
          if (second === undefined) {
            firstUp = input.track.current;
            return waitUntil(firstUp.t + DOUBLE_TAP_GAP_MS);
          }
          const at = input.track.current;
          return end({
            kind: 'double-tap',
            x: at.x,
            y: at.y,
            duration: elapsed(frame, first.down),
          });
        }
      }
      return waitUntil(deadline);
    };
  },
};

/** Two fingers down and up together, quickly and in place. */
export const twoFingerTap: Recognizer = {
  kind: 'two-finger-tap',
  continuous: false,
  requiresFailureOf: [],
  start: () => {
    const gate = createPairGate();
    let lifted = 0;
    return (frame) => {
      const reading = gate(frame);
      if (reading.type === 'fail') return FAIL;
      const since =
        reading.type === 'paired'
          ? reading.pair.since
          : frame.pointers[0]?.down;
      if (since === undefined) return WAIT;
      const deadline = since.t + TAP_MAX_MS;
      if (frame.t >= deadline) return FAIL;
      if (reading.type === 'waiting') return waitUntil(deadline);
      const { ids, start } = reading.pair;
      const input = frame.input;
      if (input === undefined || !ids.includes(input.track.id)) {
        return waitUntil(deadline);
      }
      if (input.track.travel > SLOP_PX) return FAIL;
      if (input.type === 'up') lifted += 1;
      if (lifted < 2) return waitUntil(deadline);
      const center = midpoint(start[0], start[1]);
      return end({
        kind: 'two-finger-tap',
        x: center.x,
        y: center.y,
        duration: elapsed(frame, since),
      });
    };
  },
};
