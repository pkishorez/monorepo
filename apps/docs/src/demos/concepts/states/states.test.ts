import { Effect } from 'effect';
import type { Scope } from 'effect';
import { describe, expect, it } from 'vitest';
import { Runtime } from 'effect-oak';
import { Door } from './states.js';

const run = <A>(effect: Effect.Effect<A, never, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('2. States', () => {
  it('names every State', () => {
    expect(Door.definition.states).toEqual(['Closed', 'Open', 'Locked']);
  });

  it('Transitions on Toggle, and ignores it while Locked', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Door);
        expect(app.snapshot().state).toEqual({ _tag: 'Closed' });

        app.send('Door', { _tag: 'Toggle' });
        expect(app.snapshot().state).toEqual({ _tag: 'Open' });
        app.send('Door', { _tag: 'Toggle' });
        expect(app.snapshot().state).toEqual({ _tag: 'Closed' });

        app.send('Door', { _tag: 'Lock', code: '1234' });
        expect(app.snapshot().state).toEqual({ _tag: 'Locked', code: '1234' });
        app.send('Door', { _tag: 'Toggle' });
        expect(app.log().at(-1)?.outcome).toBe('ignored');
        expect(app.snapshot().state).toEqual({ _tag: 'Locked', code: '1234' });
      }),
    ));

  it('keeps the code as State data, and only the right code unlocks', () =>
    run(
      Effect.gen(function* () {
        const app = yield* Runtime.start(Door);
        app.send('Door', { _tag: 'Lock', code: '1234' });

        // The wrong code has a rule, so it is handled, but with no Change.
        app.send('Door', { _tag: 'Unlock', code: '0000' });
        expect(app.log().at(-1)).toMatchObject({
          outcome: 'handled',
          from: 'Locked',
          to: 'Locked',
        });
        expect(app.snapshot().state).toEqual({ _tag: 'Locked', code: '1234' });

        app.send('Door', { _tag: 'Unlock', code: '1234' });
        expect(app.snapshot().state).toEqual({ _tag: 'Closed' });
        // Leaving Locked leaves its data behind: Lock is only a rule of Closed.
        app.send('Door', { _tag: 'Unlock', code: '1234' });
        expect(app.log().at(-1)?.outcome).toBe('ignored');

        expect(
          app.log().map((e) => `${e.message._tag} ${e.from}→${e.to}`),
        ).toEqual([
          'Lock Closed→Locked',
          'Unlock Locked→Locked',
          'Unlock Locked→Closed',
          'Unlock Closed→Closed',
        ]);
      }),
    ));
});
