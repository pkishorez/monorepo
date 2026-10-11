import { Effect } from 'effect';
import type { Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { Runtime } from 'effect-oak';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dice } from './commands.js';

const timed = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(TestClock.layer())),
  );

describe('Dice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Roll asks for a Command that ends in Rolled a second later', () =>
    timed(
      Effect.gen(function* () {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const app = yield* Runtime.start(Dice);
        expect(app.snapshot().model).toEqual({ value: 1, rolling: false });

        app.send('Dice', { _tag: 'Roll' });
        expect(app.snapshot().model).toEqual({ value: 1, rolling: true });
        yield* TestClock.adjust('999 millis');
        expect(app.log().map((e) => e.message._tag)).toEqual(['Roll']);

        yield* TestClock.adjust('1 millis');
        expect(app.log().map((e) => [e.message._tag, e.at])).toEqual([
          ['Roll', 0],
          ['Rolled', 1000],
        ]);
        expect(app.snapshot().model).toEqual({ value: 4, rolling: false });
        // The Message's Source is the Command, by name.
        expect(app.log()[1]!.source).toEqual({
          kind: 'command',
          instance: 'Dice',
          name: 'roll',
        });
      }),
    ));

  it('a Roll while rolling changes nothing and asks for no Command', () =>
    timed(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Dice);
        app.send('Dice', { _tag: 'Roll' });
        yield* TestClock.adjust('500 millis');
        app.send('Dice', { _tag: 'Roll' });
        yield* TestClock.adjust('1 second');
        expect(app.log().map((e) => e.message._tag)).toEqual([
          'Roll',
          'Roll',
          'Rolled',
        ]);
        expect(app.snapshot().model).toMatchObject({ rolling: false });
      }),
    ));

  it('the value travels in the Message, so Replay lands on the same face', () =>
    timed(
      Effect.gen(function* () {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const app = yield* Runtime.start(Dice);
        app.send('Dice', { _tag: 'Roll' });
        yield* TestClock.adjust('1 second');
        expect(app.snapshot().model).toMatchObject({ value: 6 });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        expect(app.snapshotAt(app.state().head)).toEqual(app.snapshot());
      }),
    ));
});
