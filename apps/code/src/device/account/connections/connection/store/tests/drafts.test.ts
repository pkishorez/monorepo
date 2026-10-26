import 'fake-indexeddb/auto';
import { Clock, Effect, Fiber, Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { Storage } from '../../../../store/index.ts';
import {
  type Place,
  type SavedDraft,
  SavedDrafts,
  savedDraftsIdb,
  storageIdb,
} from '../index.ts';

/*
 * Saved Drafts in IndexedDB, each in its Connection's database: each place's
 * own, of its Connection, for the Account named and no other; saved again,
 * the last save wins; saved as nothing, gone; a save read before one
 * already made of the place is dropped, and one is finished even once its
 * caller goes; a read waits for the saves of the place under way; and a
 * Project removed takes its Saved Drafts with it, one a save under way
 * makes too, and the saves begun before it; a Connection forgotten, with its
 * database.
 */

const run = <A>(effect: Effect.Effect<A, unknown, SavedDrafts | Storage>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(Layer.merge(savedDraftsIdb, storageIdb))),
  );

const draftOf = (text: string): SavedDraft => ({
  mode: 'Message',
  written: { Message: { text, anchor: 0, head: text.length } },
  attachments: [],
  chosen: { account: null, model: null, settings: {} },
});

const session = (
  connectionId: string,
  projectId: string,
  sessionId: string,
): Place => ({ connectionId, projectId, sessionId });

describe('Saved Drafts', () => {
  it('keeps each place its own, for the Account named alone', async () => {
    const place = session('m1', 'p1', 's1');
    const project: Place = {
      connectionId: 'm1',
      projectId: 'p1',
      sessionId: null,
    };
    const result = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        yield* saved.save('a1', place, draftOf('first'), 1n, 0n);
        yield* saved.save('a1', place, draftOf('second'), 2n, 0n);
        yield* saved.save('a1', project, draftOf('new session'), 3n, 0n);
        const mine = yield* Effect.all([
          saved.read('a1', place),
          saved.read('a1', project),
        ]);
        const theirs = yield* saved.read('a2', place);
        yield* saved.save('a1', place, null, 4n, 0n);
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
        const newer = yield* saved.save('a1', place, draftOf('newer'), 20n, 0n);
        const older = yield* saved.save('a1', place, draftOf('older'), 10n, 0n);
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
          saved.save('a1', place, draftOf('mine'), 1n, 0n),
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(caller);
        yield* Effect.sleep(50);
        return yield* saved.read('a1', place);
      }),
    );
    expect(kept).toEqual(draftOf('mine'));
  });

  it('reads a place after the saves of it under way', async () => {
    const place = session('m5', 'p5', 's5');
    const read = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        yield* Effect.forkChild(
          saved.save('a1', place, draftOf('going'), 1n, 0n),
        );
        yield* Effect.yieldNow;
        return yield* saved.read('a1', place);
      }),
    );
    expect(read).toEqual(draftOf('going'));
  });

  it('stops the saves begun before their place was dropped', async () => {
    const place = session('m6', 'p6', 's6');
    const result = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        const before = yield* Clock.monotonicTimeNanos;
        yield* saved.drop({
          _tag: 'Project',
          accountId: 'a1',
          connectionId: 'm6',
          projectId: 'p6',
        });
        const late = yield* saved.save(
          'a1',
          place,
          draftOf('late'),
          yield* Clock.monotonicTimeNanos,
          before,
        );
        const gone = yield* saved.read('a1', place);
        const after = yield* Clock.monotonicTimeNanos;
        const fresh = yield* saved.save(
          'a1',
          place,
          draftOf('fresh'),
          yield* Clock.monotonicTimeNanos,
          after,
        );
        return { late, gone, fresh, kept: yield* saved.read('a1', place) };
      }),
    );
    expect(result).toEqual({
      late: false,
      gone: null,
      fresh: true,
      kept: draftOf('fresh'),
    });
  });

  it('forgets those of a Project removed and a Connection forgotten, and no other', async () => {
    const kept = session('m1', 'p2', 's3');
    const places = [
      session('m1', 'p1', 's1'),
      { connectionId: 'm1', projectId: 'p1', sessionId: null },
      session('m2', 'p9', 's2'),
      kept,
    ];
    const left = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        for (const place of places)
          yield* saved.save('a1', place, draftOf('x'), 1n, 0n);
        yield* saved.save(
          'a2',
          session('m2', 'p9', 's2'),
          draftOf('theirs'),
          1n,
          0n,
        );
        yield* saved.drop({
          _tag: 'Project',
          accountId: 'a1',
          connectionId: 'm1',
          projectId: 'p1',
        });
        // A Connection forgotten: its saves let go of, then its database.
        yield* saved.drop({
          _tag: 'Connection',
          accountId: 'a1',
          connectionId: 'm2',
        });
        yield* (yield* Storage).dropConnection('a1', 'm2');
        const mine = yield* Effect.forEach(places, (place) =>
          saved.read('a1', place),
        );
        const theirs = yield* saved.read('a2', session('m2', 'p9', 's2'));
        return { mine, theirs };
      }),
    );
    expect(left.mine).toEqual([null, null, null, draftOf('x')]);
    expect(left.theirs).toEqual(draftOf('theirs'));
  });

  it('drops a Saved Draft a save under way makes, once it is made', async () => {
    const place = session('m7', 'p7', 's7');
    const kept = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        const saving = yield* Effect.forkChild(
          saved.save('a1', place, draftOf('under way'), 1n, 0n),
        );
        yield* Effect.yieldNow;
        yield* saved.drop({
          _tag: 'Project',
          accountId: 'a1',
          connectionId: 'm7',
          projectId: 'p7',
        });
        yield* Fiber.join(saving);
        return yield* saved.read('a1', place);
      }),
    );
    expect(kept).toBeNull();
  });

  it('keeps each Connection’s apart, a Session of the same id on another included', async () => {
    const result = await run(
      Effect.gen(function* () {
        const saved = yield* SavedDrafts;
        yield* saved.save(
          'a1',
          session('m8', 'p8', 's8'),
          draftOf('m8'),
          1n,
          0n,
        );
        yield* saved.save(
          'a1',
          session('m9', 'p8', 's8'),
          draftOf('m9'),
          1n,
          0n,
        );
        yield* saved.drop({
          _tag: 'Connection',
          accountId: 'a1',
          connectionId: 'm8',
        });
        yield* (yield* Storage).dropConnection('a1', 'm8');
        return yield* Effect.all([
          saved.read('a1', session('m8', 'p8', 's8')),
          saved.read('a1', session('m9', 'p8', 's8')),
        ]);
      }),
    );
    expect(result).toEqual([null, draftOf('m9')]);
  });
});
