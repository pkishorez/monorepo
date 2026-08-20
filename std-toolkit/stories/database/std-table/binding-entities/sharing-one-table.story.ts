import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, note, parity, table } from '../../support.js';

const NotebookSchema = EntityESchema.make('Notebook', 'notebookId', {
  notebook: Schema.String,
  title: Schema.String,
}).build();

const notebookRecord = table
  .entity(NotebookSchema)
  .primary({ pk: ['notebook'] })
  .build();

export const sharingOneTable = Story.make({
  title: 'Sharing one table',
  description: "Two entities in one table never see each other's rows.",
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A notebook record and a note are both filed under "work". Do they collide?',
      {
        answer:
          'Every key is prefixed with its entity name, so two entities keyed on the same value occupy separate partitions and each query sees only its own rows.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert({
                noteId: 'shared',
                notebook: 'work',
                title: 'Draft',
                status: 'open',
              });
              yield* notebookRecord.insert({
                notebookId: 'shared',
                notebook: 'work',
                title: 'Work',
              });
              const notes = yield* note.query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
              });
              const notebooks = yield* notebookRecord.query('primary', {
                pk: { notebook: 'work' },
                '>=': null,
              });
              return {
                notes: notes.items.map(({ meta }) => meta._e),
                notebooks: notebooks.items.map(({ meta }) => meta._e),
                titles: notes.items.map(({ value }) => value.title),
                notebookTitles: notebooks.items.map(({ value }) => value.title),
              };
            }),
          );
          yield* Story.assert(
            'each query returns only its own entity type',
            results.sqlite.notes.join() === 'Note' &&
              results.sqlite.notebooks.join() === 'Notebook',
          );
          yield* Story.assert(
            'the shared id and partition value do not overwrite each other',
            results.sqlite.titles.join() === 'Draft' &&
              results.sqlite.notebookTitles.join() === 'Work',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
