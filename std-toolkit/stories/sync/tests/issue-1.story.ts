import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  noteEntity,
  noteSource,
  type Note,
} from '../support.js';

type Commit = { readonly current: Note; readonly updates: Partial<Note> };

const commits: Commit[] = [];

const simulation = Simulation.make({
  table: storyTable,
  collections: [
    Simulation.collection({
      entity: noteEntity,
      configure: ({ backend }) => {
        const inbox = noteSource(backend, 'inbox');
        return {
          // A full-row PUT: the server stores exactly the row the client believed
          // it was editing. Any staleness in `current` is therefore visible.
          onUpdate: ({ current, updates }) =>
            Effect.suspend(() => {
              commits.push({ current, updates });
              return backend.update(
                { notebook: current.notebook, noteId: current.noteId },
                { ...current, ...updates },
              );
            }),
          sync: {
            total: {
              strategy: syncStrategy.bidirectional<Note>({
                newer: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      inbox
                        .pageNewer(cursor, 10)
                        .pipe(Effect.map((p) => [...p])),
                  }),
                older: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      inbox
                        .pageOlder(cursor, 10)
                        .pipe(Effect.map((p) => [...p])),
                  }),
                tail: ({ live }) =>
                  live({ open: ({ cursor }) => inbox.changes(cursor) }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

const seed: Note = {
  noteId: 't1',
  notebook: 'inbox',
  title: 'Buy milk',
  pinned: false,
};

const pacedUpdate = (
  collection: {
    utils: {
      pacedUpdate: (
        key: string,
        changes: Partial<Note>,
      ) => { isPersisted: { promise: Promise<unknown> } };
    };
  },
  key: string,
  changes: Partial<Note>,
) =>
  Effect.tryPromise({
    try: () => collection.utils.pacedUpdate(key, changes).isPersisted.promise,
    catch: (error) => error,
  });

export const issue1 = Story.make({
  title: 'Issue 1',
  description:
    'A regression kept runnable outside the Story tree: pacedUpdate must read the row the Browser is showing.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does the first paced update commit against?', {
      answer:
        'The row as the Browser is showing it. `utils.pacedUpdate` looks the key up in the live Collection and hands that row to the mutation as `current`.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          commits.length = 0;
          yield* backend.insert('Note', seed);
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          yield* inbox.eventuallyShows([seed]);

          yield* pacedUpdate(alice.collection('Note') as never, 't1', {
            pinned: true,
          });

          yield* Story.assert(
            'the commit saw the row the Browser was showing',
            commits[0]?.current.title === 'Buy milk',
          );
          yield* inbox.eventuallyShows([{ ...seed, pinned: true }]);
          return commits.map((commit) => commit.current);
        }),
      ),
    }),
    Story.question(
      'After the Backend edits the same row, what does a second paced update commit against?',
      {
        answer:
          'It should commit against the row the Browser is now showing — the one carrying the Backend edit. It does not: the paced updater is built once per key and cached, so its commit closure keeps the `current` row captured on the FIRST `pacedUpdate` call for that key, forever. The second commit therefore PUTs the pre-edit row and silently reverts `title` back to "Buy milk".',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            commits.length = 0;
            yield* backend.insert('Note', seed);
            const alice = browser('alice');
            const inbox = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            yield* inbox.eventuallyShows([seed]);

            // 1. The user drags the checkbox. This builds and caches the pacer for "t1",
            //    capturing `current` = the row as it stands right now.
            yield* pacedUpdate(alice.collection('Note') as never, 't1', {
              pinned: true,
            });
            yield* inbox.eventuallyShows([{ ...seed, pinned: true }]);

            // 2. Someone else renames the same Note. Sync delivers it; the Browser shows it.
            const renamed = { ...seed, title: 'Buy milk (2L)', pinned: true };
            yield* backend.update(
              'Note',
              { noteId: 't1', notebook: 'inbox' },
              { title: 'Buy milk (2L)' },
            );
            yield* inbox.eventuallyShows([renamed]);

            // 3. The user unchecks it. Same key, so the CACHED pacer runs — with the
            //    `current` it captured back in step 1.
            yield* pacedUpdate(alice.collection('Note') as never, 't1', {
              pinned: false,
            });

            yield* Story.assert(
              'the second commit saw the renamed row, not the row from the first update',
              commits[1]?.current.title === 'Buy milk (2L)',
            );
            yield* inbox.eventuallyShows([{ ...renamed, pinned: false }]);

            return {
              committedTitles: commits.map((commit) => commit.current.title),
              rows: inbox.toArray,
            };
          }),
        ),
      },
    ),
  ],
});
