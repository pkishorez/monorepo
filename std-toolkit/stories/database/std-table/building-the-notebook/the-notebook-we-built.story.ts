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
    'Step four: proof that the table and Note assembled across these Stories are the ones every later Story imports.',
  spine: true,
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'From here on the Stories import a table and a Note from `support.ts` instead of building one. Is it the same one?',
      {
        answer:
          'Yes — and this is a proof rather than a promise. The table assembled over the last three Stories has the same key slots as the shared one, and the Note bound to it has the same partition, the same sort key, and the same two access patterns.',
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
    Story.question('And the Note bound to it?', {
      answer:
        'Same entity name, same partition, same sort key, and the same access patterns under the same names — which is what makes every Story after this one readable without opening `support.ts`.',
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
