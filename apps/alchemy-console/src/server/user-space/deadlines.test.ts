import { Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeDeadlines } from './deadlines.ts';

/** A Durable Object's alarm, as storage keeps it. */
const alarmClock = () => {
  let alarm: number | null = null;
  return {
    storage: {
      getAlarm: async () => alarm,
      setAlarm: async (at: number) => {
        alarm = at;
      },
    },
    alarm: () => alarm,
  };
};

const settle = Effect.promise(() => new Promise((done) => setTimeout(done)));

describe('deadlines on the object’s alarm', () => {
  it('sets the alarm for the earliest deadline and ends each when it rings', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const clock = alarmClock();
        const deadlines = makeDeadlines(clock.storage);
        const late = yield* Effect.forkChild(deadlines.at(2000));
        const soon = yield* Effect.forkChild(deadlines.at(1000));
        yield* settle;
        expect(clock.alarm()).toBe(1000);

        yield* Effect.promise(() => deadlines.ring(1000));
        yield* Fiber.join(soon);
        expect(late.pollUnsafe()).toBeUndefined();
        expect(clock.alarm()).toBe(2000);

        yield* Effect.promise(() => deadlines.ring(2000));
        yield* Fiber.join(late);
      }),
    ));

  it('forgets a deadline nobody waits for any more', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const clock = alarmClock();
        const deadlines = makeDeadlines(clock.storage);
        const waiting = yield* Effect.forkChild(deadlines.at(1000));
        yield* settle;
        yield* Fiber.interrupt(waiting);
        yield* Effect.promise(() => deadlines.ring(500));
        expect(deadlines.pending()).toBe(0);
      }),
    ));
});
