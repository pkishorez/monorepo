import type { Effect as EffectType } from 'effect';
import { step } from 'laymos/story';

export const result: EffectType<void> = step(
  'Deferred',
  { description: 'Defers an unknown operation.' },
  () => operation,
);
