import { Effect } from 'effect';


export const result = Effect.forEach(
  [1, 2],
  (value) => Effect.succeed(value * 2),
  { concurrency: 2 },
);
