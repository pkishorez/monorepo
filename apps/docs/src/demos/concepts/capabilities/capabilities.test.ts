import { Effect } from 'effect';
import type { Scope } from 'effect';
import { Runtime, instanceAt } from 'effect-oak';
import type { Instance } from 'effect-oak';
import { describe, expect, it } from 'vitest';
import { Board } from './capabilities.js';

/** Let the forked Command run and its Request land. */
const settle = Effect.gen(function* () {
  for (let i = 0; i < 10; i++) yield* Effect.yieldNow;
});

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('Capabilities', () => {
  it('a Scorer reports through Scores and the Board hears a Request', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Board);
        app.send('Board', { _tag: 'AddPlayer' });
        expect(app.snapshot().model).toMatchObject({ players: ['P-1', 'P-2'] });

        const second = 'Board/players[P-2]#1';
        const before = instanceAt(app.snapshot(), second) as Instance;
        expect(before.model).toEqual({ name: 'P-2', scored: 0 });

        app.send(second, { _tag: 'Score' });
        yield* settle;

        // The Scorer kept its own count, and the Request raised the Board's total.
        expect(instanceAt(app.snapshot(), second)?.model).toEqual({
          name: 'P-2',
          scored: 1,
        });
        expect(app.snapshot().model).toMatchObject({ total: 1 });

        // The Request's Source is the Scorer's Command, addressed to the Board.
        const scored = app.log().at(-1)!;
        expect(scored.destination).toBe('Board');
        expect(scored.message).toEqual({ _tag: 'Scored', name: 'P-2' });
        expect(scored.source).toMatchObject({
          kind: 'command',
          instance: second,
          name: 'report',
        });
      }),
    ));

  it('removing a player stops its Scorer; a late Score is dropped', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Board);
        app.send('Board', { _tag: 'RemoveLast' });
        expect(app.snapshot().children['players']).toEqual([]);
        app.send('Board/players[P-1]#1', { _tag: 'Score' });
        expect(app.outcome(app.log().at(-1)!.id)).toBe('dropped');
        expect(app.snapshot().model).toMatchObject({ total: 0 });
      }),
    ));
});
