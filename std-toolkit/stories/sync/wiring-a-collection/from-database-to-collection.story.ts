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
  description: 'A note written on the Backend appears in a mounted Live Query.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('The Backend creates a note. What does the Browser see?', {
      answer:
        'The Backend persists the entity, the Sync Worker delivers it into the Browser’s Sync Replica, the Collection projects it, and the mounted Live Query shows it.',
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
    Story.question('Can the Browser create the note instead?', {
      answer:
        'Yes. Alice inserts into her named Note Collection. TanStack DB applies the optimistic row, Std Sync persists the intent through the Backend, and the confirmed entity replaces it in Alice’s Sync Replica.',
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
    Story.question('The Browser updates a note. Does it reach the Backend?', {
      answer:
        'Yes. Alice mutates her named Note Collection. Std Sync sends the direct mutation to the Backend and writes the confirmed entity into Alice’s Sync Replica.',
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
    }),
    Story.question('The Browser removes a note. What remains?', {
      answer:
        'The Backend and Browser Sync Replica retain a tombstone, while the mounted Live Query no longer shows the row.',
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
