import { Effect } from 'effect';
import { flow } from 'laymos/story';

export const double = flow(
  'Double',
  { description: 'Doubles a number.' },
  (value: number) => Effect.succeed(value * 2),
);
