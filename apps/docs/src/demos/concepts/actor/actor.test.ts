import { Effect } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from 'effect-oak';
import { Counter } from './actor.js';

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('1. Actor', () => {
  it('changes its Model only through Update, one Message at a time', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        expect(app.snapshot().model).toEqual({ count: 0 });

        app.send('Counter', { _tag: 'Increment' });
        app.send('Counter', { _tag: 'Increment' });
        expect(app.snapshot().model).toEqual({ count: 2 });

        app.send('Counter', { _tag: 'Decrement' });
        expect(app.snapshot().model).toEqual({ count: 1 });

        app.send('Counter', { _tag: 'Reset' });
        expect(app.snapshot().model).toEqual({ count: 0 });

        // Every Message is a Log entry, handled, Sent by a View to the one Instance.
        expect(
          app.log().map((e) => `${e.instance} ${e.message._tag} ${e.outcome}`),
        ).toEqual([
          'Counter Increment handled',
          'Counter Increment handled',
          'Counter Decrement handled',
          'Counter Reset handled',
        ]);
        expect(app.log().every((e) => e.source.kind === 'view')).toBe(true);
      }),
    ));

  it('Replays to the same Model from the Messages alone', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Counter);
        app.send('Counter', { _tag: 'Increment' });
        app.send('Counter', { _tag: 'Increment' });
        app.send('Counter', { _tag: 'Decrement' });
        expect(app.snapshotAt(app.state().head)).toEqual(app.snapshot());
        expect(app.snapshotAt(0)?.model).toEqual({ count: 1 });
      }),
    ));
});
