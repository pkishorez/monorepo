import 'fake-indexeddb/auto';
import { Effect, Fiber } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  type Place,
  type SavedDraft,
  SavedDrafts,
} from '../capabilities/index.ts';
import { savedDraftsIdb } from './index.ts';

/*
 * Saved Drafts in IndexedDB: each place's own, for the Account named and
 * no other; saved again, the last save wins; saved as nothing, gone; a
 * save read before one already made of the place is dropped, and one is
 * finished even once its caller goes; and a Project removed, a Machine
 * forgotten or no longer listed, or an Account signed out takes its Saved
 * Drafts with it.
 */

const run = <A>(effect: Effect.Effect<A, unknown, SavedDrafts>) =>
  Effect.runPromise(effect.pipe(Effect.provide(savedDraftsIdb)));

const draftOf = (text: string): SavedDraft => ({
  mode: 'Message',
  written: { Message: { text, anchor: 0, head: text.length } },
  attachments: [],
  chosen: { account: null, model: null, settings: {} },
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
        yield* saved.save('a1', place, draftOf('first'), 1n);
        yield* saved.save('a1', place, draftOf('second'), 2n);
        yield* saved.save('a1', project, draftOf('new session'), 3n);
        const mine = yield* Effect.all([
          saved.read('a1', place),
          saved.read('a1', project),
        ]);
        const theirs = yield* saved.read('a2', place);
        yield* saved.save('a1', place, null, 4n);
        const after = yield* saved.read('a1', place);
        return { mine, theirs, after };
      }),
    );
    expect(result.mine).toEqual([draftOf('second'), draftOf('new session')]);
    expect(result.theirs).toBeNull();
    expect(result.after).toBeNull();
  });

  it('drops a save read before one already made of the place', async () => {
    const place = session('m3', 'p3', 's3');
    const result = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        const newer = yield* saved.save('a1', place, draftOf('newer'), 20n);
        const older = yield* saved.save('a1', place, draftOf('older'), 10n);
        return { newer, older, kept: yield* saved.read('a1', place) };
      }),
    );
    expect([result.newer, result.older]).toEqual([true, false]);
    expect(result.kept).toEqual(draftOf('newer'));
  });

  it('finishes a save even once its caller goes', async () => {
    const place = session('m4', 'p4', 's4');
    const kept = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        const caller = yield* Effect.forkChild(
          saved.save('a1', place, draftOf('mine'), 1n),
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(caller);
        yield* Effect.sleep(50);
        return yield* saved.read('a1', place);
      }),
    );
    expect(kept).toEqual(draftOf('mine'));
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
          yield* saved.save('a1', place, draftOf('x'), 1n);
        yield* saved.save('a2', kept, draftOf('theirs'), 1n);
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
          saved.read('a1', place),
        );
        yield* saved.drop({ _tag: 'SignedOut', signedIn: ['a1'] });
        const theirs = yield* saved.read('a2', kept);
        const still = yield* saved.read('a1', kept);
        return { mine, theirs, still };
      }),
    );
    expect(left.mine).toEqual([null, null, null, null, draftOf('x')]);
    expect(left.theirs).toBeNull();
    expect(left.still).toEqual(draftOf('x'));
  });
});
