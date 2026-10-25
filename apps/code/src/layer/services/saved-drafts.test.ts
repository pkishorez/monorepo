import 'fake-indexeddb/auto';
import { Effect, Layer } from 'effect';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import { describe, expect, it } from 'vitest';
import { type SavedDraft, SavedDrafts } from '../capabilities/index.ts';
import { savedDraftsIdb } from './index.ts';

/*
 * Saved Drafts in IndexedDB: each place's own, for the Account signed in
 * and no other; written again, the last write wins; cleared, gone; and a
 * Project removed, a Machine forgotten or an Account signed out takes its
 * Saved Drafts with it.
 */

const account = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  image: null,
  test: false,
});

/** Saved Drafts as `id` signed in sees them. */
const as = (id: string) =>
  savedDraftsIdb.pipe(
    Layer.provide(
      Layer.mock(Accounts)({
        current: Effect.succeed(
          AccountsState.SignedIn({
            active: account(id),
            accounts: [account('a1'), account('a2')],
          }),
        ),
      }),
    ),
  );

const run = <A>(id: string, effect: Effect.Effect<A, unknown, SavedDrafts>) =>
  Effect.runPromise(effect.pipe(Effect.provide(as(id))));

const drafts = Effect.map(SavedDrafts, (saved) => saved);

const draftOf = (text: string): SavedDraft => ({
  mode: 'Message',
  written: { Message: { text, anchor: 0, head: text.length } },
  attachments: [],
  chosen: { account: null, model: null, settings: {} },
});

const session = (machineId: string, projectId: string, sessionId: string) => ({
  machineId,
  projectId,
  sessionId,
});

describe('Saved Drafts', () => {
  it('keeps each place its own, for the Account signed in alone', async () => {
    const place = session('m1', 'p1', 's1');
    const project = { machineId: 'm1', projectId: 'p1', sessionId: null };
    await run(
      'a1',
      Effect.gen(function* () {
        const saved = yield* drafts;
        yield* saved.write(place, draftOf('first'));
        yield* saved.write(place, draftOf('second'));
        yield* saved.write(project, draftOf('new session'));
      }),
    );
    const [mine, theirs] = await Promise.all([
      run(
        'a1',
        Effect.flatMap(drafts, (saved) =>
          Effect.all([saved.read(place), saved.read(project)]),
        ),
      ),
      run(
        'a2',
        Effect.flatMap(drafts, (saved) => saved.read(place)),
      ),
    ]);
    expect(mine).toEqual([draftOf('second'), draftOf('new session')]);
    expect(theirs).toBeNull();
    await run(
      'a1',
      Effect.flatMap(drafts, (saved) => saved.clear(place)),
    );
    expect(
      await run(
        'a1',
        Effect.flatMap(drafts, (saved) => saved.read(place)),
      ),
    ).toBeNull();
  });

  it('forgets those of a Project removed, a Machine forgotten and an Account signed out', async () => {
    const kept = session('m1', 'p2', 's3');
    const places = [
      session('m1', 'p1', 's1'),
      { machineId: 'm1', projectId: 'p1', sessionId: null },
      session('m2', 'p9', 's2'),
      kept,
    ];
    await run(
      'a1',
      Effect.gen(function* () {
        const saved = yield* drafts;
        for (const place of places) yield* saved.write(place, draftOf('x'));
        yield* saved.dropProject('m1', 'p1');
        yield* saved.dropMachine('a1', 'm2');
      }),
    );
    await run(
      'a2',
      Effect.flatMap(drafts, (saved) => saved.write(kept, draftOf('theirs'))),
    );
    const left = await run(
      'a1',
      Effect.flatMap(drafts, (saved) =>
        Effect.forEach(places, (place) => saved.read(place)),
      ),
    );
    expect(left).toEqual([null, null, null, draftOf('x')]);
    await run(
      'a1',
      Effect.flatMap(drafts, (saved) => saved.keepAccounts(['a1'])),
    );
    expect(
      await run(
        'a2',
        Effect.flatMap(drafts, (saved) => saved.read(kept)),
      ),
    ).toBeNull();
    expect(
      await run(
        'a1',
        Effect.flatMap(drafts, (saved) => saved.read(kept)),
      ),
    ).toEqual(draftOf('x'));
  });
});
