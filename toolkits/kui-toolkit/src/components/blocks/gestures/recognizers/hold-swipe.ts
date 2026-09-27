import { elapsed, horizontal, trackOf } from './geometry';
import { createPairGate } from './pair';
import { HOLD_MS, HOLD_SWIPE_START_PX, SLOP_PX } from './thresholds';
import type { Recognizer } from './types';
import { createVelocityTracker } from './velocity';
import { end, FAIL, track, WAIT } from './verdicts';

/**
 * A chord: one finger held still while another swipes sideways. The held
 * finger must already have been down for {@link HOLD_MS} when the swipe is
 * decided, so two fingers landing and moving together stay a pinch or a
 * two-finger swipe. `side` says which finger holds, by x order.
 */
export const holdSwipe: Recognizer = {
  kind: 'hold-swipe',
  continuous: true,
  requiresFailureOf: [],
  start: () => {
    const gate = createPairGate();
    let roles: { readonly holder: number; readonly swiper: number } | undefined;
    const velocity = createVelocityTracker();
    return (frame) => {
      const reading = gate(frame);
      if (reading.type === 'fail') return FAIL;
      if (reading.type === 'waiting') return WAIT;
      const { ids } = reading.pair;
      const input = frame.input;
      if (input === undefined || !ids.includes(input.track.id)) return WAIT;
      const a = trackOf(frame, ids[0]);
      const b = trackOf(frame, ids[1]);
      if (a === undefined || b === undefined) return FAIL;

      if (roles === undefined) {
        if (input.type === 'up') return FAIL;
        const moved = [a, b].filter((pointer) => pointer.travel > SLOP_PX);
        if (moved.length === 0) return WAIT;
        if (moved.length === 2) return FAIL;
        const swiper = moved[0];
        const holder = swiper === a ? b : a;
        const dx = swiper.current.x - swiper.down.x;
        const dy = swiper.current.y - swiper.down.y;
        if (Math.abs(dy) >= Math.abs(dx)) return FAIL;
        if (Math.abs(dx) < HOLD_SWIPE_START_PX) return WAIT;
        if (elapsed(frame, holder.down) < HOLD_MS) return FAIL;
        roles = { holder: holder.id, swiper: swiper.id };
        velocity.add(swiper.down.x, swiper.down.t);
      }

      const holder = roles.holder === a.id ? a : b;
      const swiper = roles.swiper === a.id ? a : b;
      velocity.add(swiper.current.x, frame.t);
      const event = {
        kind: 'hold-swipe' as const,
        x: swiper.current.x,
        y: swiper.current.y,
        duration: elapsed(frame, holder.down),
        side:
          holder.current.x < swiper.current.x
            ? ('left-holds' as const)
            : ('right-holds' as const),
        ...horizontal(
          swiper.current.x - swiper.down.x,
          frame.width,
          velocity.velocity(),
        ),
      };
      return input.type === 'up' ? end(event) : track(event);
    };
  },
};
