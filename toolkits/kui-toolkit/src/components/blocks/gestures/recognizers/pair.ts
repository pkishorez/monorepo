import { SLOP_PX } from './thresholds';
import type { Frame, Sample } from './types';

/** The two pointers of a two-finger gesture, as they were when the second landed. */
export type Pair = {
  readonly ids: readonly [number, number];
  readonly start: readonly [Sample, Sample];
  /** When the first of the two went down. */
  readonly since: Sample;
};

type PairReading =
  | { readonly type: 'waiting' }
  | { readonly type: 'fail' }
  | { readonly type: 'paired'; readonly pair: Pair };

/**
 * Waits for a second pointer. The first may not lift or wander off first:
 * then the touch was a one-finger gesture.
 */
export const createPairGate = () => {
  let pair: Pair | undefined;
  return (frame: Frame): PairReading => {
    if (pair !== undefined) return { type: 'paired', pair };
    const input = frame.input;
    if (input === undefined) return { type: 'waiting' };
    if (input.type === 'up') return { type: 'fail' };
    if (input.type === 'down' && frame.pointers.length === 2) {
      const [first, second] = frame.pointers;
      pair = {
        ids: [first.id, second.id],
        start: [first.current, second.current],
        since: first.down,
      };
      return { type: 'paired', pair };
    }
    return input.track.travel > SLOP_PX
      ? { type: 'fail' }
      : { type: 'waiting' };
  };
};
