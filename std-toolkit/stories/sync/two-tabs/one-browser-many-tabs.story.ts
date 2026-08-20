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
                source: ({ paginated }) =>
                  paginated({
                    fetch: ({ cursor }) =>
                      inbox
                        .pageNewer(cursor, 10)
                        .pipe(Effect.map((p) => [...p])),
                  }),
              }),
            },
          },
        };
      },
    }),
  ] as const,
});

const milk: Note = {
  noteId: 't1',
  notebook: 'inbox',
  title: 'Buy milk',
  pinned: false,
};
const dog: Note = {
  noteId: 't2',
  notebook: 'inbox',
  title: 'Walk dog',
  pinned: false,
};

export const oneBrowserManyTabs = Story.make({
  title: 'Two Tabs, One Browser',
  description:
    'A second tab starts empty. The backend fills it, not the first tab.',
  spine: true,
  setupNote:
    'The table, the Note, and the collection that the simulation uses. `Simulation.make` builds the world, and `simulation.run` runs one script inside it. `browser("alice").tab("second")` opens a second tab with its own copy of the data.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Alice opens a second tab. What does it show?', {
      answer:
        'It shows the notes that the backend confirmed. The new tab has a new copy of the data. The backend fills that copy, and the collection projects it. Peer sync is a path between tabs that are already open. It is not what starts a tab.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const first = yield* alice.mount({
            name: 'first-tab',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          yield* backend.insert('Note', milk);
          yield* first.eventuallyShows([milk]);

          const second = alice.tab('second');
          const later = yield* second.mount({
            name: 'second-tab',
            query: (q) => q.from({ note: second.collection('Note') }),
          });
          yield* later.eventuallyShows([milk]);
          return later.toArray;
        }),
      ),
    }),
    Story.question('Alice adds a note in one tab. Does the other tab see it?', {
      answer:
        'Yes. The backend confirms the write, and the writing tab accepts the confirmed note into its copy. Peer sync then sends that note to the matching collection in the other tab.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const second = alice.tab('second');
          const left = yield* alice.mount({
            name: 'left',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const right = yield* second.mount({
            name: 'right',
            query: (q) => q.from({ note: second.collection('Note') }),
          });

          yield* alice.insert('Note', milk);
          yield* left.eventuallyShows([milk]);
          yield* right.eventuallyShows([milk]);
          return right.toArray;
        }),
      ),
    }),
    Story.question(
      'Alice changes a note in one tab. Does the other tab follow?',
      {
        answer:
          'Yes. The change stays in the writing tab until the backend confirms it. The confirmed note then goes through peer sync, and the other tab applies it in the normal way.',
        proof: simulation.run(({ browser }) =>
          Effect.gen(function* () {
            const alice = browser('alice');
            const second = alice.tab('second');
            const left = yield* alice.mount({
              name: 'left',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            const right = yield* second.mount({
              name: 'right',
              query: (q) => q.from({ note: second.collection('Note') }),
            });
            yield* alice.insert('Note', milk);
            yield* right.eventuallyShows([milk]);

            yield* second.update(
              'Note',
              { noteId: 't1', notebook: 'inbox' },
              { pinned: true },
            );
            yield* left.eventuallyShows([{ ...milk, pinned: true }]);
            return left.toArray;
          }),
        ),
      },
    ),
    Story.question(
      'Alice removes a note in one tab. Does it disappear in the other?',
      {
        answer:
          'Yes. The removal is stored as a confirmed marked row. Peer sync carries it in the same way as any other confirmed note. The receiving copy keeps the marked row, and its screen removes the note.',
        proof: simulation.run(({ browser }) =>
          Effect.gen(function* () {
            const alice = browser('alice');
            const second = alice.tab('second');
            const left = yield* alice.mount({
              name: 'left',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            const right = yield* second.mount({
              name: 'right',
              query: (q) => q.from({ note: second.collection('Note') }),
            });
            yield* alice.insert('Note', milk);
            yield* alice.insert('Note', dog);
            yield* right.eventuallyShows([milk, dog]);

            yield* second.remove('Note', { noteId: 't1', notebook: 'inbox' });
            yield* left.eventuallyShows([dog]);
            return left.toArray;
          }),
        ),
      },
    ),
    Story.question('Alice closes a tab. Does the other tab notice?', {
      answer:
        'Unmounting the query does not stop the peer channel that the collection owns. The tab continues to accept confirmed notes into its own copy, and a later mount shows them.',
      proof: simulation.run(({ browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const second = alice.tab('second');
          const left = yield* alice.mount({
            name: 'left',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const right = yield* second.mount({
            name: 'right',
            query: (q) => q.from({ note: second.collection('Note') }),
          });
          yield* alice.insert('Note', milk);
          yield* right.eventuallyShows([milk]);

          yield* second.unmount(right);
          yield* alice.insert('Note', dog);
          yield* left.eventuallyShows([milk, dog]);

          const reopened = yield* second.mount({
            name: 'reopened',
            query: (q) => q.from({ note: second.collection('Note') }),
          });
          yield* reopened.eventuallyShows([milk, dog]);
          return reopened.toArray;
        }),
      ),
    }),
  ],
});
