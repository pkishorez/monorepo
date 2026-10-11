import { Effect } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { Runtime } from 'effect-oak';
import type { Running } from 'effect-oak';
import { describe, expect, it } from 'vitest';
import { Clock } from './workers.js';

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

/** The Time of every Message with this tag, in order. */
const times = (app: Running<unknown>, tag: string) =>
  app
    .log()
    .filter((e) => e.message._tag === tag)
    .map((e) => e.at);

const workers = (app: Running<unknown>) =>
  app.workers('Clock').map((w) => `${w.name}/${w.key}`);

describe('Clock', () => {
  it('tick is owned by the Instance: Ticked every second from the start', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Clock);
        expect(workers(app)).toEqual(['tick/']);
        yield* TestClock.adjust('2500 millis');
        expect(times(app, 'Ticked')).toEqual([1000, 2000]);
        expect(app.snapshot().model).toMatchObject({ ticks: 2 });
        expect(app.log()[0]!.source).toEqual({
          kind: 'worker',
          instance: 'Clock',
          name: 'tick',
        });
      }),
    ));

  it('run is owned by the Running State: Ran every 250 ms, counted in the State', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Clock);
        app.send('Clock', { _tag: 'Toggle' });
        expect(workers(app)).toEqual(['tick/', 'run/']);
        yield* TestClock.adjust('1 second');
        expect(times(app, 'Ran')).toEqual([250, 500, 750, 1000]);
        expect(app.snapshot().state).toEqual({
          _tag: 'Running',
          since: 0,
          ran: 4,
        });

        // Leaving Running closes the Worker's Scope.
        app.send('Clock', { _tag: 'Toggle' });
        expect(workers(app)).toEqual(['tick/']);
        yield* TestClock.adjust('1 second');
        expect(times(app, 'Ran')).toEqual([250, 500, 750, 1000]);

        // Entering it again starts a fresh one, from the Model alone.
        app.send('Clock', { _tag: 'Toggle' });
        yield* TestClock.adjust('250 millis');
        expect(app.snapshot().state).toEqual({
          _tag: 'Running',
          since: 2000,
          ran: 1,
        });
      }),
    ));

  it('blink is owned by a yes or no in the Model: Blinked every 400 ms while armed', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Clock);
        app.send('Clock', { _tag: 'Arm' });
        expect(workers(app)).toEqual(['tick/', 'blink/']);
        yield* TestClock.adjust('400 millis');
        expect(app.snapshot().model).toMatchObject({ blink: true });
        yield* TestClock.adjust('400 millis');
        expect(app.snapshot().model).toMatchObject({ blink: false });

        app.send('Clock', { _tag: 'Arm' });
        expect(workers(app)).toEqual(['tick/']);
        yield* TestClock.adjust('800 millis');
        expect(times(app, 'Blinked')).toEqual([400, 800]);
      }),
    ));

  it('countdown runs one per key: CountedDown 3 s after each was added', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Clock);
        app.send('Clock', { _tag: 'AddCountdown' });
        yield* TestClock.adjust('1 second');
        app.send('Clock', { _tag: 'AddCountdown' });
        expect(workers(app)).toEqual(['tick/', 'countdown/c1', 'countdown/c2']);
        expect(app.snapshot().model).toMatchObject({
          countdowns: [
            { key: 'c1', startedAt: 0 },
            { key: 'c2', startedAt: 1000 },
          ],
        });

        yield* TestClock.adjust('2 seconds');
        expect(times(app, 'CountedDown')).toEqual([3000]);
        // The key left the Model, so the Worker's Scope closed.
        expect(workers(app)).toEqual(['tick/', 'countdown/c2']);

        yield* TestClock.adjust('1 second');
        expect(times(app, 'CountedDown')).toEqual([3000, 4000]);
        expect(app.snapshot().model).toMatchObject({
          countdowns: [],
          done: ['c1', 'c2'],
        });
        expect(
          app.log().findLast((e) => e.message._tag === 'CountedDown')!.source,
        ).toEqual({
          kind: 'worker',
          instance: 'Clock',
          name: 'countdown',
          key: 'c2',
        });
      }),
    ));

  it('every Worker waits from the Time, so a stop and a fork wait only what is left', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Clock);
        app.send('Clock', { _tag: 'AddCountdown' });
        yield* TestClock.adjust('1 second');
        yield* app.stop();
        // The Clock runs on while stopped; Time does not.
        yield* TestClock.adjust('5 seconds');
        yield* app.start();
        expect(app.now()).toBe(1000);
        yield* TestClock.adjust('1999 millis');
        expect(times(app, 'CountedDown')).toEqual([]);
        yield* TestClock.adjust('1 millis');
        expect(times(app, 'CountedDown')).toEqual([3000]);
        expect(times(app, 'Ticked')).toEqual([1000, 2000, 3000]);

        // A fork from the entry that added it waits the whole 3 s again.
        yield* app.start(0);
        expect(app.now()).toBe(0);
        yield* TestClock.adjust('3 seconds');
        expect(times(app, 'CountedDown')).toEqual([3000]);
        expect(times(app, 'Ticked')).toEqual([1000, 2000, 3000]);
      }),
    ));
});
