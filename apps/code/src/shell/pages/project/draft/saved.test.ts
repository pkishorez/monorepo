import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { SavedDrafts } from '../../../../layer/capabilities/index.ts';
import { savedDraftsMemory } from '../../../../layer/services/index.ts';
import { hold, keepParts, keepWritten, taken } from './saved.ts';

/*
 * The parts of a Saved Draft, each kept by its owner: a write stamped
 * older than one already made of the same part is dropped, as a flush
 * that read the Draft before a later save; other parts are left as they
 * are; and a send taken with nothing written since forgets the whole
 * Saved Draft, while one written since keeps it.
 */

const WHERE = {
  accountId: 'a1',
  machineId: 'm1',
  projectId: 'p1',
  sessionId: 's1',
};

const written = (text: string) => ({ text, anchor: text.length, head: 0 });

const run = <A>(effect: Effect.Effect<A, unknown, SavedDrafts>) =>
  Effect.runPromise(effect.pipe(Effect.provide(savedDraftsMemory())));

const read = Effect.flatMap(SavedDrafts, (saved) =>
  saved.read(WHERE.accountId, WHERE),
);

describe('Saved Draft parts', () => {
  it('drops a write older than one already made of its part', async () => {
    const kept = await run(
      Effect.gen(function* () {
        yield* keepWritten(WHERE, 20, 'Message', written('newer'));
        yield* keepWritten(WHERE, 10, 'Message', written('older'));
        yield* keepWritten(WHERE, 11, 'SideQuestion', written('a question'));
        yield* keepParts(WHERE, 5, {
          mode: 'SideQuestion',
          attachments: [],
          chosen: { account: null, model: 'haiku', settings: {} },
        });
        return yield* read;
      }),
    );
    expect(kept?.draft).toEqual({
      mode: 'SideQuestion',
      written: {
        Message: written('newer'),
        SideQuestion: written('a question'),
      },
      attachments: [],
      chosen: { account: null, model: 'haiku', settings: {} },
      unsent: [],
    });
  });

  it('forgets it once a send is taken with nothing written since, and keeps it otherwise', async () => {
    const [untouched, later] = await run(
      Effect.gen(function* () {
        yield* keepWritten(
          { ...WHERE, sessionId: 's2' },
          30,
          'Message',
          written('Carry on'),
        );
        const held = yield* hold(
          { ...WHERE, sessionId: 's2' },
          { key: 'k1', text: 'Carry on', attachments: [] },
        );
        yield* taken({ ...WHERE, sessionId: 's2' }, 'k1', held);
        const untouched = yield* Effect.flatMap(SavedDrafts, (saved) =>
          saved.read('a1', { ...WHERE, sessionId: 's2' }),
        );
        const again = yield* hold(WHERE, {
          key: 'k2',
          text: 'Again',
          attachments: [],
        });
        yield* keepWritten(WHERE, 40, 'Message', {
          text: 'Then this',
          anchor: 0,
          head: 0,
        });
        yield* taken(WHERE, 'k2', again);
        return [untouched, yield* read] as const;
      }),
    );
    expect(untouched).toBeNull();
    expect(later?.draft.written['Message']?.text).toBe('Then this');
    expect(later?.draft.unsent).toEqual([]);
  });
});
