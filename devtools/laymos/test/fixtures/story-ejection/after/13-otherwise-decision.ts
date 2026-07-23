import { Effect, Match } from 'effect';


export const result = Match.value(route).pipe(
  Match.when('ok', () => Effect.succeed('ok')),
  Match.orElse(() => Effect.fail(route)),
);
