import { step } from 'laymos/story';

export const result = step(
  'Deferred',
  { description: 'Defers an unknown operation.' },
  () => operation,
);
