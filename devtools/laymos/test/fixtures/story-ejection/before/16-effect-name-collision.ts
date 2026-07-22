import { Option } from 'effect';
import { step } from 'laymos/story';

const Effect = 'occupied';
export const fallback = Option.none();
export const result = step(
  'Deferred',
  { description: 'Defers an unknown operation.' },
  () => operation,
);
