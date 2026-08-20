import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { note as sharedNote, table as sharedTable } from '../../support.js';

const table = StdTable.make('notebook')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
  status: Schema.String,
}).build();

const note = table
  .entity(NoteSchema)
  .primary({ pk: ['notebook'] })
  .index('LSI1', 'byTitle', { sk: ['title'] })
  .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status', 'title'] })
  .build();

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export const theNotebookWeBuilt = Story.make({
  title: 'The notebook we built',
  description:
    'Step four. This Story proves that the table and the Note built here are the ones that the other Stories use.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The Stories after this one import a table and a Note from `support.ts`. Is it the same pair?',
      {
        answer:
          'Yes, and this question proves it. The table built in the three Stories above has the same key attributes and the same index slots as the one in `support.ts`.',
        proof: Effect.gen(function* () {
          yield* Story.assert(
            'both tables have the same primary key attributes',
            same(table.primary, sharedTable.primary),
          );
          yield* Story.assert(
            'both tables have the same index slots',
            same(
              Object.keys(table.localSecondaryIndexes),
              Object.keys(sharedTable.localSecondaryIndexes),
            ) &&
              same(
                Object.keys(table.globalSecondaryIndexes),
                Object.keys(sharedTable.globalSecondaryIndexes),
              ),
          );
          return {
            primary: table.primary,
            lsis: Object.keys(table.localSecondaryIndexes),
            gsis: Object.keys(table.globalSecondaryIndexes),
          };
        }),
      },
    ),
    Story.question('Is the Note bound to it the same Note?', {
      answer:
        'Yes. It has the same entity name, the same partition, the same sort key, and the same access patterns. You can therefore read each Story after this one without opening `support.ts`.',
      proof: Effect.gen(function* () {
        yield* Story.assert(
          'both bind the same entity',
          note.name === sharedNote.name,
        );
        yield* Story.assert(
          'both key it the same way',
          same(note.primary, sharedNote.primary),
        );
        yield* Story.assert(
          'both expose the same access patterns',
          same(note.accessPatterns, sharedNote.accessPatterns),
        );
        return {
          name: note.name,
          primary: note.primary,
          patterns: Object.keys(note.accessPatterns),
        };
      }),
    }),
  ],
});
