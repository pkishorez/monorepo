import { Effect } from 'effect';
import { forEach as each } from 'laymos/story';

export const result = each(
  [1, 2],
  (value) => Effect.succeed(value * 2),
  { concurrency: 2 },
);
