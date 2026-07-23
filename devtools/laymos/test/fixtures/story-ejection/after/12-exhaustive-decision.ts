import { Effect, Match } from 'effect';


export const result = Match.value(route).pipe(
  Match.when('ok', () =>
      Effect.succeed(1)),
  Match.when('bad', () =>
      Effect.fail(new Error('bad'))),
  Match.exhaustive,
);
