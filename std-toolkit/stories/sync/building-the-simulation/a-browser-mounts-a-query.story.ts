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
    'Step two: someone opens the notebook, and a screen starts watching it.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Alice opens the notebook. What has to exist before a note written on the server can appear on her screen?',
      {
        answer:
          'Three things, and this Story creates all of them: a Browser with its own copy of the data, a Collection holding the Notes inside it, and a Live Query — the thing a screen actually mounts and the thing that updates when the copy does.',
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
    Story.question(
      'What are `shows` and `eventuallyShows` doing in that proof?',
      {
        answer:
          'Asserting on the mounted Live Query. `shows` asserts what is on screen right now; `eventuallyShows` waits for it to settle, because a Backend write reaches a screen through a worker rather than instantly. Almost every Story in this part ends in one of the two.',
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
      },
    ),
  ],
});
