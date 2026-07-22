import { Effect as Fx } from 'effect';
import { step } from 'laymos/story';

export const result = step(
  'Deferred',
  { description: 'Defers execution.' },
  () => Fx.void,
);
