import 'fake-indexeddb/auto';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  type Place,
  type SavedDraft,
  SavedDrafts,
} from '../capabilities/index.ts';
import { savedDraftsIdb } from './index.ts';

/*
 * Saved Drafts in IndexedDB: each place's own, for the Account named and
 * no other; written again, the last write wins and the revision counts
 * up; changed to nothing, gone; writes to one place never lose one
 * another; and a Project removed, a Machine forgotten or no longer
 * listed, or an Account signed out takes its Saved Drafts with it.
 */

const run = <A>(effect: Effect.Effect<A, unknown, SavedDrafts>) =>
  Effect.runPromise(effect.pipe(Effect.provide(savedDraftsIdb)));

const draftOf = (text: string): SavedDraft => ({
  mode: 'Message',
  written: { Message: { text, anchor: 0, head: text.length } },
  attachments: [],
  chosen: { account: null, model: null, settings: {} },
  unsent: [],
});

const session = (
  machineId: string,
  projectId: string,
  sessionId: string,
): Place => ({ machineId, projectId, sessionId });

describe('Saved Drafts', () => {
  it('keeps each place its own, for the Account named alone', async () => {
    const place = session('m1', 'p1', 's1');
    const project: Place = {
      machineId: 'm1',
      projectId: 'p1',
      sessionId: null,
    };
    const result = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        const first = yield* saved.write('a1', place, () => draftOf('first'));
        const second = yield* saved.write('a1', place, () => draftOf('second'));
        yield* saved.write('a1', project, () => draftOf('new session'));
        const mine = yield* Effect.all([
          saved.read('a1', place),
          saved.read('a1', project),
        ]);
        const theirs = yield* saved.read('a2', place);
        const gone = yield* saved.write('a1', place, () => null);
        const after = yield* saved.read('a1', place);
        return { first, second, mine, theirs, gone, after };
      }),
    );
    expect([result.first, result.second]).toEqual([1, 2]);
    expect(result.mine).toEqual([
      { draft: draftOf('second'), revision: 2 },
      { draft: draftOf('new session'), revision: 1 },
    ]);
    expect(result.theirs).toBeNull();
    expect(result.gone).toBeNull();
    expect(result.after).toBeNull();
  });

  it('makes one write at a time to a place, so none is lost', async () => {
    const place = session('m3', 'p3', 's3');
    const kept = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        yield* Effect.forEach(
          ['a', 'b', 'c', 'd', 'e'],
          (letter) =>
            saved.write('a1', place, (kept) =>
              draftOf(`${kept?.draft.written['Message']?.text ?? ''}${letter}`),
            ),
          { concurrency: 'unbounded', discard: true },
        );
        return yield* saved.read('a1', place);
      }),
    );
    expect(kept?.draft.written['Message']?.text).toHaveLength(5);
    expect(kept?.revision).toBe(5);
  });

  it('forgets those of a Project removed, a Machine forgotten or unlisted, and an Account signed out', async () => {
    const kept = session('m1', 'p2', 's3');
    const places = [
      session('m1', 'p1', 's1'),
      { machineId: 'm1', projectId: 'p1', sessionId: null },
      session('m2', 'p9', 's2'),
      session('m4', 'p4', 's4'),
      kept,
    ];
    const left = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        for (const place of places)
          yield* saved.write('a1', place, () => draftOf('x'));
        yield* saved.write('a2', kept, () => draftOf('theirs'));
        yield* saved.drop({
          _tag: 'Project',
          machineId: 'm1',
          projectId: 'p1',
        });
        yield* saved.drop({
          _tag: 'Machine',
          accountId: 'a1',
          machineId: 'm2',
        });
        yield* saved.drop({
          _tag: 'Unlisted',
          accountId: 'a1',
          listed: ['m1', 'm2'],
        });
        const mine = yield* Effect.forEach(places, (place) =>
          Effect.map(saved.read('a1', place), (each) => each?.draft ?? null),
        );
        yield* saved.drop({ _tag: 'SignedOut', signedIn: ['a1'] });
        const theirs = yield* saved.read('a2', kept);
        const still = yield* saved.read('a1', kept);
        return { mine, theirs, still };
      }),
    );
    expect(left.mine).toEqual([null, null, null, null, draftOf('x')]);
    expect(left.theirs).toBeNull();
    expect(left.still?.draft).toEqual(draftOf('x'));
  });
});
