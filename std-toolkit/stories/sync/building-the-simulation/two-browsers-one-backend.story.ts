import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';
import { syncStrategy } from 'std-toolkit/sync';

import { Simulation, type BackendEntity } from '../support.js';

const storyTable = StdTable.make('sync-stories').primary('pk', 'sk').build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  pinned: Schema.Boolean,
}).build();

const noteEntity = storyTable
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .build();

type Note = typeof NoteSchema.Type;

// Everything the Backend has, oldest first — enough for one notebook.
const notebookSource = (
  backend: BackendEntity<typeof noteEntity>,
  notebook: string,
) => {
  const all = backend
    .query('primary', { pk: { notebook }, '>=': null })
    .pipe(
      Effect.map((page) =>
        [...page.items].sort((left, right) =>
          left.meta._u < right.meta._u ? -1 : 1,
        ),
      ),
    );
  return {
    changes: (cursor: { meta: { _u: string } } | null) =>
      backend.changes({
        cursor: cursor as never,
        includes: (entity) => entity.value.notebook === notebook,
        catchUp: (from) =>
          all.pipe(
            Effect.map((entities) =>
              entities.filter(
                (entity) => from === null || entity.meta._u > from.meta._u,
              ),
            ),
          ),
      }),
  };
};

const simulation = Simulation.make({
  table: storyTable,
  collections: [
    Simulation.collection({
      entity: noteEntity,
      configure: ({ backend }) => {
        const inbox = notebookSource(backend, 'inbox');
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

const first = {
  noteId: 'n1',
  notebook: 'inbox',
  title: 'Before Bob left',
  pinned: false,
};
const missed = {
  noteId: 'n2',
  notebook: 'inbox',
  title: 'While Bob was away',
  pinned: false,
};

export const twoBrowsersOneBackend = Story.make({
  title: 'Two browsers, one backend',
  description:
    'Step three. A second person opens the same notebook, and one of them goes offline.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Bob opens the same notebook on his own machine. What do he and Alice share?',
      {
        answer:
          'The backend only. Each browser has its own copy of the data, its own collections, and its own worker that reads the server. A write therefore reaches each of them separately. One browser does not pass it to the other.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            const alice = browser('alice');
            const bob = browser('bob');
            const aliceInbox = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            const bobInbox = yield* bob.mount({
              name: 'inbox',
              query: (q) => q.from({ note: bob.collection('Note') }),
            });
            yield* backend.insert('Note', first);
            yield* aliceInbox.eventuallyShows([first]);
            yield* bobInbox.eventuallyShows([first]);
            return { alice: aliceInbox.toArray, bob: bobInbox.toArray };
          }),
        ),
      },
    ),
    Story.question('Bob loses his connection. What happens to Alice?', {
      answer:
        'Nothing. Only Bob stops. Alice continues to receive writes. The screen of Bob keeps what it had. When he connects again, his own worker reads what he missed and reaches the same state.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const bob = browser('bob');
          const aliceInbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          const bobInbox = yield* bob.mount({
            name: 'inbox',
            query: (q) => q.from({ note: bob.collection('Note') }),
          });
          yield* backend.insert('Note', first);
          yield* aliceInbox.eventuallyShows([first]);
          yield* bobInbox.eventuallyShows([first]);
          yield* bob.disconnect;
          yield* backend.insert('Note', missed);
          yield* aliceInbox.eventuallyShows([first, missed]);
          yield* bobInbox.shows([first]);
          yield* bob.reconnect;
          yield* bobInbox.eventuallyShows([first, missed]);
          return { alice: aliceInbox.toArray, bob: bobInbox.toArray };
        }),
      ),
    }),
  ],
});
