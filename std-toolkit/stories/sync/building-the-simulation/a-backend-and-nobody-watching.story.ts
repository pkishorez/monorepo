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

export const aBackendAndNobodyWatching = Story.make({
  title: 'A backend, and nobody watching',
  description:
    'Step one of four: a server with notes on it, before any browser exists.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Before any of the sync machinery, there is a server with notes on it. What is that, here?',
      {
        answer:
          'The Backend — one table, standing in for a real server. It accepts writes and answers queries, and nothing about it knows that browsers exist. Every Story in this part starts from a Backend in some state.',
        proof: simulation.run(({ backend }) =>
          Effect.gen(function* () {
            yield* backend.insert('Note', {
              noteId: 'n1',
              notebook: 'inbox',
              title: 'Buy milk',
              pinned: false,
            });
            const page = yield* backend
              .entity('Note')
              .query('primary', { pk: { notebook: 'inbox' }, '>=': null });
            yield* Story.assert(
              'the Backend kept the note',
              page.items.length === 1,
            );
            yield* Story.assert(
              'and it is the note that was written',
              page.items[0]!.value.title === 'Buy milk',
            );
            return page.items.map(({ value }) => value);
          }),
        ),
      },
    ),
    Story.question('Does writing to it notify anyone?', {
      answer:
        'There is nobody to notify. A Backend write is just a write; everything that makes it show up somewhere is added in the next three Stories.',
      proof: simulation.run(({ backend }) =>
        Effect.gen(function* () {
          yield* backend.insert('Note', {
            noteId: 'n1',
            notebook: 'inbox',
            title: 'Buy milk',
            pinned: false,
          });
          yield* backend.insert('Note', {
            noteId: 'n2',
            notebook: 'inbox',
            title: 'Call Ada',
            pinned: false,
          });
          const page = yield* backend
            .entity('Note')
            .query('primary', { pk: { notebook: 'inbox' }, '>=': null });
          yield* Story.assert(
            'both writes landed, with nothing observing them',
            page.items.length === 2,
          );
          return page.items.map(({ value }) => value.title);
        }),
      ),
    }),
  ],
});
