import { Effect } from 'effect';


export const result = Effect.all([Effect.succeed(1), Effect.succeed(2)], {
  concurrency: 2,
});
