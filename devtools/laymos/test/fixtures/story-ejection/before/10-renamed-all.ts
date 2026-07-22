import { Effect } from 'effect';
import { all as together } from 'laymos/story';

export const result = together([Effect.succeed(1), Effect.succeed(2)], {
  concurrency: 2,
});
