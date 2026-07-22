import * as Fx from 'effect/Effect';
import { step } from 'laymos/story';

export const result = step(
  'Deferred',
  { description: 'Defers execution.' },
  () => Fx.void,
);
