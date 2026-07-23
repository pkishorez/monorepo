import { Effect, Match } from 'effect';


export const result = Match.value(true).pipe(
  Match.when(true, () =>
      Effect.succeed('done')),
  Match.exhaustive,
);
