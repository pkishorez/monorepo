import { Effect } from 'effect';


export const result = Effect.flatMap(Effect.suspend(() => Effect.succeed(route)), (decisionValue) => {
  switch (decisionValue) {
    case 'ok':
      return ((value) => Effect.succeed(value))(decisionValue);
    default:
      return ((value) => Effect.fail(value))(decisionValue);
  }
});
