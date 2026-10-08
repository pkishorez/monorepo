import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { forgetfulCheckpoint, makeStreamCheckpoint } from './checkpoint.ts';

describe('StreamCheckpoint', () => {
  it('opts in, replaces state, and clears without requiring a schema', async () => {
    let saved = Option.none<unknown>();
    const checkpoint = makeStreamCheckpoint({
      get: Effect.sync(() => saved),
      put: (state) => Effect.sync(() => void (saved = Option.some(state))),
      clear: Effect.sync(() => void (saved = Option.none())),
    });

    await Effect.runPromise(checkpoint.put(undefined));
    expect((await Effect.runPromise(checkpoint.get()))._tag).toBe('Some');

    await Effect.runPromise(checkpoint.put({ cursor: 2 }));
    expect(
      Option.getOrThrow(await Effect.runPromise(checkpoint.get())),
    ).toEqual({ cursor: 2 });

    await Effect.runPromise(checkpoint.clear);
    expect((await Effect.runPromise(checkpoint.get()))._tag).toBe('None');
  });

  it('remembers nothing outside a WebSocket-server stream', async () => {
    await Effect.runPromise(forgetfulCheckpoint.put(3, Schema.Number));
    await Effect.runPromise(forgetfulCheckpoint.clear);
    expect(
      Option.isNone(
        await Effect.runPromise(forgetfulCheckpoint.get(Schema.Number)),
      ),
    ).toBe(true);
  });
});
