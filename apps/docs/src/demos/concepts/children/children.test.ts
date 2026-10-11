import { Effect } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime, instanceAt } from 'effect-oak';
import { Room } from './children.js';

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('a fixed Child', () => {
  it('exists for as long as its State lasts', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Room);
        expect(app.snapshot().state._tag).toBe('Empty');
        expect(app.snapshot().children).toEqual({});

        app.send('Room', { _tag: 'Toggle' });
        expect(app.snapshot().state._tag).toBe('Occupied');
        expect(instanceAt(app.snapshot(), 'Room/counter#1')?.model).toEqual({
          count: 0,
        });

        app.send('Room/counter#1', { _tag: 'Increment' });
        app.send('Room/counter#1', { _tag: 'Increment' });
        expect(instanceAt(app.snapshot(), 'Room/counter#1')?.model).toEqual({
          count: 2,
        });

        // Leaving Occupied stops the Counter; its count goes with it.
        app.send('Room', { _tag: 'Toggle' });
        expect(app.snapshot().children).toEqual({});
        app.send('Room/counter#1', { _tag: 'Increment' });
        expect(app.outcome(app.log().at(-1)!.id)).toBe('dropped');
      }),
    ));

  it('is Invoked again as a new Instance, starting from init', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Room);
        app.send('Room', { _tag: 'Toggle' });
        app.send('Room/counter#1', { _tag: 'Increment' });
        app.send('Room', { _tag: 'Toggle' });
        app.send('Room', { _tag: 'Toggle' });

        expect(instanceAt(app.snapshot(), 'Room/counter#1')).toBeUndefined();
        expect(instanceAt(app.snapshot(), 'Room/counter#2')?.model).toEqual({
          count: 0,
        });
        // Replay gives the same Snapshot the live app has.
        expect(app.snapshotAt(app.state().head)).toEqual(app.snapshot());
      }),
    ));
});
