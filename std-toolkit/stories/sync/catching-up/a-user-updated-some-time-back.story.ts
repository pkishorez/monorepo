import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { syncStrategy } from 'std-toolkit/sync';
import {
  Simulation,
  storyTable,
  noteEntity,
  noteSource,
  type Note,
  type NoteEntity,
} from '../support.js';

const batches: string[][] = [];
const simulation = Simulation.make({
  table: storyTable,
  collections: [
    Simulation.collection({
      entity: noteEntity,
      configure: ({ backend }) => {
        const inbox = noteSource(backend, 'inbox');
        return {
          sync: {
            total: {
              strategy: syncStrategy.oldToNew<Note>({
                source: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      inbox.pageNewer(cursor, 2).pipe(
                        Effect.tap((page: readonly NoteEntity[]) =>
                          Effect.sync(() => {
                            if (page.length > 0) {
                              batches.push(
                                page.map((entity) => entity.meta._u),
                              );
                            }
                          }),
                        ),
                        Effect.map((page) => [...page]),
                      ),
                  }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

const history: Note[] = [
  { noteId: 't1', notebook: 'inbox', title: 'Buy milk', pinned: true },
  { noteId: 't2', notebook: 'inbox', title: 'Walk dog', pinned: false },
  { noteId: 't3', notebook: 'inbox', title: 'Write report', pinned: false },
];

const seed = (
  backend: Parameters<Parameters<typeof simulation.run>[0]>[0]['backend'],
) =>
  Effect.gen(function* () {
    yield* backend.insert('Note', { ...history[0]!, pinned: false });
    yield* backend.insert('Note', history[1]!);
    yield* backend.insert('Note', history[2]!);
    yield* backend.update(
      'Note',
      { noteId: 't1', notebook: 'inbox' },
      { pinned: true },
    );
  });

export const aUserUpdatedSomeTimeBack = Story.make({
  title: 'Backend history before mount',
  description: 'A browser that has been away finds the history waiting for it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The backend has history before the browser mounts. Does the browser read it?',
      {
        answer:
          'Yes. The history of the backend does not depend on a browser. Mounting the live query starts the collection and its worker. The worker reads forward until the query shows the current notes.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            batches.length = 0;
            yield* seed(backend);
            const alice = browser('alice');
            const inbox = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            yield* inbox.eventuallyShows(history);
            yield* Story.assert(
              'history arrived in multiple pages',
              batches.length > 1,
            );
            const stamps = batches.flat();
            yield* Story.assert(
              'pages moved oldest to newest',
              stamps.every(
                (stamp, index) => index === 0 || stamps[index - 1]! < stamp,
              ),
            );
            return { batches, rows: inbox.toArray };
          }),
        ),
      },
    ),
    Story.question('Does a note that was deleted long ago stay deleted?', {
      answer:
        'Yes. The backend keeps the marked row, and the worker delivers it. The live query shows live notes only.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          batches.length = 0;
          yield* seed(backend);
          yield* backend.remove('Note', {
            noteId: 't2',
            notebook: 'inbox',
          });
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          yield* inbox.eventuallyShows(
            history.filter((note) => note.noteId !== 't2'),
          );
          return inbox.toArray;
        }),
      ),
    }),
  ],
});
