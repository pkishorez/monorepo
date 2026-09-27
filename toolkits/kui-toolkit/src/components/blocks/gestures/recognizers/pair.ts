import { SLOP_PX } from './thresholds';
import type { Frame } from './types';

/** The two pointers of a two-finger gesture, in the order they went down. */
export type Pair = { readonly ids: readonly [number, number] };

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
      pair = { ids: [first.id, second.id] };
      return { type: 'paired', pair };
    }
    return input.track.travel > SLOP_PX
      ? { type: 'fail' }
      : { type: 'waiting' };
  };
};
