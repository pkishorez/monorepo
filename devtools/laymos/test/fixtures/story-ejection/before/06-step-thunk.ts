import { Effect } from 'effect';
import { step } from 'laymos/story';

export const result = step(
  'Deferred',
  { description: 'Defers Effect construction.' },
  () => Effect.void,
);
