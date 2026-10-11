import { Effect } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime, instanceAt } from 'effect-oak';
import type { Instance, Running } from 'effect-oak';
import { Scoreboard } from './keyed-children.js';

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const players = (app: Running<unknown>) =>
  app.snapshot().children['players'] as ReadonlyArray<Instance>;

describe('keyed Children', () => {
  it('follow the Model by key, each starting from its Input', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Scoreboard);
        expect(players(app).map((p) => [p.id, p.model])).toEqual([
          ['Scoreboard/players[P-1]#1', { name: 'P-1', count: 0 }],
        ]);

        app.send('Scoreboard', { _tag: 'AddPlayer' });
        app.send('Scoreboard', { _tag: 'AddPlayer' });
        expect(players(app).map((p) => p.key)).toEqual(['P-1', 'P-2', 'P-3']);
        expect(app.snapshot().model).toEqual({
          players: ['P-1', 'P-2', 'P-3'],
          next: 4,
        });

        app.send('Scoreboard/players[P-2]#1', { _tag: 'Increment' });
        expect(
          instanceAt(app.snapshot(), 'Scoreboard/players[P-2]#1')?.model,
        ).toEqual({ name: 'P-2', count: 1 });
        // A Message to one Player changes nothing in the others.
        expect(players(app)[0]!.model).toEqual({ name: 'P-1', count: 0 });
      }),
    ));

  it('stop when their key leaves the Model, and come back new', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Scoreboard);
        app.send('Scoreboard/players[P-1]#1', { _tag: 'Increment' });
        app.send('Scoreboard', { _tag: 'RemoveLast' });
        expect(players(app)).toEqual([]);

        // The Player is gone, so a Message for it is dropped.
        app.send('Scoreboard/players[P-1]#1', { _tag: 'Increment' });
        expect(app.log().at(-1)?.outcome).toBe('dropped');

        // Removing from an empty Scoreboard is a handled Message with no Change.
        app.send('Scoreboard', { _tag: 'RemoveLast' });
        expect(app.snapshot().model).toEqual({ players: [], next: 2 });

        // The next name is P-2, so the key is new too; the count starts over.
        app.send('Scoreboard', { _tag: 'AddPlayer' });
        expect(players(app).map((p) => [p.id, p.model])).toEqual([
          ['Scoreboard/players[P-2]#1', { name: 'P-2', count: 0 }],
        ]);
        expect(app.snapshotAt(app.state().head)).toEqual(app.snapshot());
      }),
    ));
});
