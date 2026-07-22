import { Effect } from 'effect';
import { flow } from 'laymos/story';

export const result = flow(
  'Load',
  { description: 'Loads a value.' },
  () => Effect.succeed(1),
)();
