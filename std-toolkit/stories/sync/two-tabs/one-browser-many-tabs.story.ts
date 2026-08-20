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
    'A second tab starts empty and is filled by the backend, not by its sibling.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question('Alice opens a second tab. What does it show?', {
      answer:
        'The Backend-confirmed rows. The new tab owns a new Memory Sync Replica, so backend sync fills that replica and its TanStack DB Collection Projection. Peer Sync is a live-tab shortcut, not startup authority.',
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
        'Yes. After the Backend confirms the mutation, the writing tab accepts the complete Entity into its Sync Replica. Peer Sync sends that Entity to the matching qualified Collection, where the sibling converges its separate Memory replica and advances its projection immediately.',
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
    Story.question('Alice edits a note in one tab. Does the other follow?', {
      answer:
        'Yes. The edit stays optimistic and tab-local until the Backend confirms it. The accepted Entity then enters Peer Sync, and the sibling applies normal convergence without relaying the delivery.',
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
    }),
    Story.question(
      'Alice removes a note in one tab. Does it vanish in the other?',
      {
        answer:
          'Yes. The removal is stored as a confirmed tombstone, and Peer Sync carries it like any other accepted Entity. The receiving replica retains the tombstone while its projection removes the row.',
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
        'Unmounting the query does not stop the Collection-owned Peer Channel. The tab keeps accepting confirmed Entities into its own Sync Replica, and a later mount advances its new Projection Position over them. Disposing the Std Sync is what closes Peer Sync.',
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
