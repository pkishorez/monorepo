import { Effect } from 'effect';


export const result = ((selector) => Effect.flatMap(typeof selector === 'function' ? Effect.suspend(selector) : Effect.succeed(selector), (decisionValue) => {
  switch (decisionValue) {
    case true:
      return Effect.succeed('boolean');
    case -1:
      return Effect.succeed('number');
    case 'text':
      return Effect.succeed('string');
    default:
      return Effect.die(new Error(`Unexpected decision value: ${String(decisionValue)}`));
  }
}))(value);
