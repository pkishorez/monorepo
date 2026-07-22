import { Effect } from 'effect';


export const result = ((selector) => Effect.flatMap(typeof selector === 'function' ? Effect.suspend(selector) : Effect.succeed(selector), (decisionValue) => {
  switch (decisionValue) {
    case 'ok':
      return Effect.suspend(() => Effect.succeed(1));
    case 'bad':
      return Effect.fail(new Error('bad'));
    default:
      return Effect.die(new Error(`Unexpected decision value: ${String(decisionValue)}`));
  }
}))(route);
