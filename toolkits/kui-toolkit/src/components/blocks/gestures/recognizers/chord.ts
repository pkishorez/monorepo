import { elapsed, trackOf } from './geometry';
import { createPairGate } from './pair';
import { ANCHOR_DRIFT_PX, ANCHOR_MS, SLOP_PX } from './thresholds';
import type { Recognizer } from './types';
import { createVelocityTracker } from './velocity';
import { end, FAIL, track, WAIT } from './verdicts';

/**
 * One finger held still, the Anchor, while another acts. Decided the moment
 * the second finger lands: the first must have been down for
 * {@link ANCHOR_MS} without moving, and then it claims at once, before either
 * finger moves, so the touch is Captured from the start. Two fingers landing
 * together are no gesture. The acting finger's first movement past the slop
 * locks `axis`. Lifting either finger ends it; the Anchor drifting past
 * {@link ANCHOR_DRIFT_PX} cancels it.
 */
export const chord: Recognizer = {
  kind: 'chord',
  continuous: true,
  requiresFailureOf: [],
  fingers: ['anchor', 'acting'],
  start: () => {
    const gate = createPairGate();
    let side: 'left' | 'right' = 'left';
    let axis: 'vertical' | 'horizontal' | undefined;
    const vx = createVelocityTracker();
    const vy = createVelocityTracker();
    return (frame) => {
      const reading = gate(frame);
      if (reading.type === 'fail') return FAIL;
      if (reading.type === 'waiting') return WAIT;
      const { ids } = reading.pair;
      const input = frame.input;
      if (input === undefined || !ids.includes(input.track.id)) return WAIT;
      const anchor = trackOf(frame, ids[0]);
      const acting = trackOf(frame, ids[1]);
      if (anchor === undefined || acting === undefined) return FAIL;

      // The only down it sees is the acting finger landing: a third cancels.
      if (input.type === 'down') {
        if (elapsed(frame, anchor.down) < ANCHOR_MS) return FAIL;
        side = anchor.current.x < acting.current.x ? 'left' : 'right';
      } else if (anchor.travel > ANCHOR_DRIFT_PX) {
        return FAIL;
      }
      if (input.track.id === acting.id) {
        vx.add(acting.current.x, frame.t);
        vy.add(acting.current.y, frame.t);
      } else if (input.type === 'move') {
        // The Anchor shifting within its drift changes nothing.
        return WAIT;
      }

      const dx = acting.current.x - acting.down.x;
      const dy = acting.current.y - acting.down.y;
      if (axis === undefined && acting.travel > SLOP_PX) {
        axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      const event = {
        kind: 'chord' as const,
        x: acting.current.x,
        y: acting.current.y,
        duration: elapsed(frame, anchor.down),
        side,
        anchor: { x: anchor.current.x, y: anchor.current.y },
        axis,
        dx,
        dy,
        velocity:
          axis === undefined ? 0 : (axis === 'horizontal' ? vx : vy).velocity(),
      };
      return input.type === 'up' ? end(event) : track(event);
    };
  },
};
