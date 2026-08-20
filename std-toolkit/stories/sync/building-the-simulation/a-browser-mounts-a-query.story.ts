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

const buyMilk = {
  noteId: 'n1',
  notebook: 'inbox',
  title: 'Buy milk',
  pinned: false,
};

export const aBrowserMountsAQuery = Story.make({
  title: 'A browser mounts a query',
  description:
    'Step two. Someone opens the notebook, and a screen starts to watch it.',
  spine: true,
  setupNote:
    'The table, the Note, and the collection that the simulation uses. `Simulation.make` builds the world, and `simulation.run` runs one script inside it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Alice opens the notebook. What must exist before a note on the server can appear on her screen?',
      {
        answer:
          'Three things, and this Story makes all of them. There is a browser, which holds its own copy of the data. There is a collection, which holds the notes inside that copy. There is a live query, which a screen mounts and which updates when the copy updates.',
        proof: simulation.run(({ backend, browser }) =>
          Effect.gen(function* () {
            const alice = browser('alice');
            const inbox = yield* alice.mount({
              name: 'inbox',
              query: (q) => q.from({ note: alice.collection('Note') }),
            });
            yield* inbox.shows([]);
            yield* backend.insert('Note', buyMilk);
            yield* inbox.eventuallyShows([buyMilk]);
            return inbox.toArray;
          }),
        ),
      },
    ),
    Story.question('What do `shows` and `eventuallyShows` do?', {
      answer:
        'They assert on the mounted live query. `shows` asserts what is on the screen now. `eventuallyShows` waits for the screen to settle, because a write reaches a screen through a worker and not at once. Almost every Story in this part ends with one of the two.',
      proof: simulation.run(({ backend, browser }) =>
        Effect.gen(function* () {
          const alice = browser('alice');
          const inbox = yield* alice.mount({
            name: 'inbox',
            query: (q) => q.from({ note: alice.collection('Note') }),
          });
          yield* backend.insert('Note', buyMilk);
          yield* inbox.eventuallyShows([buyMilk]);
          yield* inbox.shows([buyMilk]);
          yield* Story.assert(
            'once it has settled, the immediate assertion holds too',
            inbox.toArray.length === 1,
          );
          return inbox.toArray;
        }),
      ),
    }),
  ],
});
