import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import { describe, expect, it } from 'vitest';
import { LiveActivity } from '../index.ts';

/*
 * The web's Live Activity, the one an app gets when it provides none: a
 * browser has none, so it says so and starts nothing.
 */

describe('Live Activity on the web', () => {
  it('is not supported, and starts, updates and ends nothing', async () => {
    const answers = await Effect.runPromise(
      Effect.gen(function* () {
        const live = yield* LiveActivity;
        return [
          yield* live.supported,
          yield* live.start({ title: 'Order', status: 'Packed' }),
          yield* live.update('a', { status: 'On its way', progress: 0.5 }),
          yield* live.end('a'),
        ];
      }),
    );
    expect(answers).toEqual([false, Option.none(), false, false]);
  });
});
