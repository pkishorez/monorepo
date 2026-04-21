import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect } from 'effect';

describe('rpc', () => {
  itEffect('works with Effect', () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed('hello');
      expect(result).toBe('hello');
    }),
  );
});
