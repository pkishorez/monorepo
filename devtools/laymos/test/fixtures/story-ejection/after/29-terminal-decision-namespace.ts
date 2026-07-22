import { Effect } from 'effect';


export const result = Effect.flatMap(Effect.succeed(true), (decisionValue) => {
  switch (decisionValue) {
    case true:
      return Effect.suspend(() => Effect.succeed('done'));
    default:
      return Effect.die(new Error(`Unexpected decision value: ${String(decisionValue)}`));
  }
});
