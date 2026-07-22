import { Option } from 'effect';
import { step } from 'laymos/story';

export const fallback = Option.none();
export const result = step(
  'Deferred',
  { description: 'Defers an unknown operation.' },
  () => operation,
);
