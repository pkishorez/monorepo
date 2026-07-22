import { step } from 'laymos/story';

export const result = step(
  'Existing call',
  { description: 'Uses an Effect-returning call.' },
  operation(),
);
