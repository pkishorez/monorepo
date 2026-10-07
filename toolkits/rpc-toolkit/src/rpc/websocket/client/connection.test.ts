import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Stream from 'effect/Stream';
import { describe, expect, it, vi } from 'vitest';
import { makeRpcConnection } from './connection.ts';

const waitFor = (assertion: () => void) =>
  vi.waitFor(assertion, { timeout: 1_000 });

describe('keepSubscribed', () => {
  it('starts when connected and waits while initially connecting', async () => {
    const connection = await Effect.runPromise(makeRpcConnection);
    let starts = 0;
    const fiber = Effect.runFork(
      connection
        .keepSubscribed(() =>
          Stream.fromEffect(Effect.sync(() => starts++)).pipe(
            Stream.concat(Stream.never),
          ),
        )
        .pipe(Stream.runDrain),
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(starts).toBe(0);

    await Effect.runPromise(connection.hooks.onConnect);
    await waitFor(() => expect(starts).toBe(1));
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  it('restarts once after each disconnect and reconnect', async () => {
    const connection = await Effect.runPromise(makeRpcConnection);
    let starts = 0;
    await Effect.runPromise(connection.hooks.onConnect);
    const fiber = Effect.runFork(
      connection
        .keepSubscribed(() =>
          Stream.fromEffect(Effect.sync(() => starts++)).pipe(
            Stream.concat(Stream.never),
          ),
        )
        .pipe(Stream.runDrain),
    );

    await waitFor(() => expect(starts).toBe(1));
    await Effect.runPromise(connection.hooks.onDisconnect);
    await Effect.runPromise(connection.hooks.onConnect);
    await waitFor(() => expect(starts).toBe(2));
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  it('propagates subscription completion and errors', async () => {
    const connection = await Effect.runPromise(makeRpcConnection);
    await Effect.runPromise(connection.hooks.onConnect);

    const values = await Effect.runPromise(
      connection
        .keepSubscribed(() => Stream.make(1, 2))
        .pipe(Stream.runCollect),
    );
    expect(Array.from(values)).toEqual([1, 2]);

    const error = await Effect.runPromise(
      connection
        .keepSubscribed(() => Stream.fail('subscription failed'))
        .pipe(Stream.runDrain, Effect.flip),
    );
    expect(error).toBe('subscription failed');
  });

  it('does not restart after cancellation', async () => {
    const connection = await Effect.runPromise(makeRpcConnection);
    let starts = 0;
    await Effect.runPromise(connection.hooks.onConnect);
    const fiber = Effect.runFork(
      connection
        .keepSubscribed(() =>
          Stream.fromEffect(Effect.sync(() => starts++)).pipe(
            Stream.concat(Stream.never),
          ),
        )
        .pipe(Stream.runDrain),
    );

    await waitFor(() => expect(starts).toBe(1));
    await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(connection.hooks.onDisconnect);
    await Effect.runPromise(connection.hooks.onConnect);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(starts).toBe(1);
  });

  it('keeps separate invocations independent', async () => {
    const connection = await Effect.runPromise(makeRpcConnection);
    let starts = 0;
    await Effect.runPromise(connection.hooks.onConnect);
    const subscribe = () =>
      connection
        .keepSubscribed(() =>
          Stream.fromEffect(Effect.sync(() => starts++)).pipe(
            Stream.concat(Stream.never),
          ),
        )
        .pipe(Stream.runDrain);
    const first = Effect.runFork(subscribe());
    const second = Effect.runFork(subscribe());

    await waitFor(() => expect(starts).toBe(2));
    await Effect.runPromise(Fiber.interrupt(first));
    await Effect.runPromise(connection.hooks.onDisconnect);
    await Effect.runPromise(connection.hooks.onConnect);
    await waitFor(() => expect(starts).toBe(3));
    await Effect.runPromise(Fiber.interrupt(second));
  });
});
