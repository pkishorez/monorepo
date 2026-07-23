import { Effect, Match } from 'effect';


export const result = Match.value(value).pipe(
  Match.when(true, () => Effect.succeed('boolean')),
  Match.when(-1, () => Effect.succeed('number')),
  Match.when('text', () => Effect.succeed('string')),
  Match.exhaustive,
);
