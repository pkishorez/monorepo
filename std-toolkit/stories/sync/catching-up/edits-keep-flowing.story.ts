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

const counters = { fetches: 0 };
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
              strategy: syncStrategy.bidirectional<Note>({
                newer: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      Effect.suspend(() => {
                        counters.fetches += 1;
                        return inbox.pageNewer(cursor, 2);
                      }).pipe(Effect.map((page) => [...page])),
                  }),
                older: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      Effect.suspend(() => {
                        counters.fetches += 1;
                        return inbox.pageOlder(cursor, 2);
                      }).pipe(Effect.map((page) => [...page])),
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

const history: Note[] = [
  { noteId: 't1', notebook: 'inbox', title: 'Buy milk', pinned: false },
  { noteId: 't2', notebook: 'inbox', title: 'Walk dog', pinned: false },
  { noteId: 't3', notebook: 'inbox', title: 'Write report', pinned: false },
  { noteId: 't4', notebook: 'inbox', title: 'Book flights', pinned: false },
  { noteId: 't5', notebook: 'inbox', title: 'Call plumber', pinned: false },
];

export const editsKeepFlowing = Story.make({
  title: 'Edits keep flowing',
  description:
    'A gap is closed from both ends at once — newest first and oldest last.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('How does bidirectional sync swallow a backlog?', {
      answer:
        'The Browser mounts after five Backend writes. Bidirectional sync loads the newest and oldest edges immediately and closes the gap from both directions.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          counters.fetches = 0;
          yield* Effect.forEach(history, (note) =>
            backend.insert('Note', note),
          );
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          yield* inbox.eventuallyShows(history);
          return inbox.toArray;
        }),
      ),
    }),
    Story.question('After catch-up, does a fresh edit use the live tail?', {
      answer:
        'Yes. The mounted query stays active. A later Backend edit arrives through the live subscription without rerunning the historical fetches.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          counters.fetches = 0;
          yield* Effect.forEach(history, (note) =>
            backend.insert('Note', note),
          );
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          yield* inbox.eventuallyShows(history);
          const fetchesAfterCatchUp = counters.fetches;
          const updated = history.map((note) =>
            note.noteId === 't3'
              ? { ...note, title: 'Write report (final)', pinned: true }
              : note,
          );
          yield* backend.update(
            'Note',
            { noteId: 't3', notebook: 'inbox' },
            { title: 'Write report (final)', pinned: true },
          );
          yield* inbox.eventuallyShows(updated);
          yield* Story.assert(
            'the historical fetch count stayed still',
            counters.fetches === fetchesAfterCatchUp,
          );
          return { fetches: counters.fetches, rows: inbox.toArray };
        }),
      ),
    }),
  ],
});
