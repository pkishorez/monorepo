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
                source: ({ live }) =>
                  live({ open: ({ cursor }) => inbox.changes(cursor) }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

export const fromDatabaseToCollection = Story.make({
  title: 'From Backend to Browser',
  description:
    'The first note that makes the complete trip, in each of the four directions.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('The backend creates a note. What does the browser see?', {
      answer:
        'It sees the note. The backend stores it. The worker delivers it into the copy that the browser holds. The collection projects it, and the mounted live query shows it.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const note = {
            noteId: 't1',
            notebook: 'inbox',
            title: 'Buy milk',
            pinned: false,
          };
          yield* backend.insert('Note', note);
          yield* inbox.eventuallyShows([note]);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('Can the browser create the note instead?', {
      answer:
        'Yes. Alice writes into her Note collection. The screen shows the note at once, before the backend answers. The system then sends the write to the backend, and the confirmed note replaces the one on the screen.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const note = {
            noteId: 't1',
            notebook: 'inbox',
            title: 'Buy milk',
            pinned: false,
          };
          yield* alice.insert('Note', note);
          yield* inbox.eventuallyShows([note]);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question(
      'The browser changes a note. Does the change reach the backend?',
      {
        answer:
          'Yes. Alice changes her Note collection. The system sends the change to the backend and writes the confirmed note into her copy of the data.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            const alice = browser('alice');
            const inbox = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            const note = {
              noteId: 't1',
              notebook: 'inbox',
              title: 'Buy milk',
              pinned: false,
            };
            yield* backend.insert('Note', note);
            yield* inbox.eventuallyShows([note]);
            yield* alice.update(
              'Note',
              { noteId: 't1', notebook: 'inbox' },
              { pinned: true },
            );
            yield* inbox.eventuallyShows([{ ...note, pinned: true }]);
            return inbox.toArray;
          }),
        ),
      },
    ),
    Story.question('The browser removes a note. What remains?', {
      answer:
        'A marked row remains, in the backend and in the copy that the browser holds. The mounted live query no longer shows the note.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const note = {
            noteId: 't1',
            notebook: 'inbox',
            title: 'Buy milk',
            pinned: false,
          };
          yield* backend.insert('Note', note);
          yield* inbox.eventuallyShows([note]);
          yield* alice.remove('Note', {
            noteId: 't1',
            notebook: 'inbox',
          });
          yield* inbox.eventuallyShows([]);
          return inbox.toArray;
        }),
      ),
    }),
  ],
});
