import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

import { StdTable } from 'std-toolkit/db';

import { agree, parity } from '../../support.js';

// Its own binding over the same physical table, so the shared Note keeps the
// index it was built with and this one can declare a nullable component.
const table = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const ReminderNote = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  status: Schema.String,
  dueOn: Schema.NullOr(Schema.String),
}).build();

const note = table
  .entity(ReminderNote)
  .primary({ pk: ['notebook'] })
  .index('GSI1', 'byDue', { pk: ['notebook'], sk: ['status', 'dueOn'] })
  .build();

const notes = [
  { noteId: 'n1', notebook: 'work', status: 'open', dueOn: '2026-01-05' },
  { noteId: 'n2', notebook: 'work', status: 'open', dueOn: null },
  { noteId: 'n3', notebook: 'work', status: 'open', dueOn: '2026-02-01' },
];

const seed = Effect.forEach(notes, (value) => note.insert(value));

const idsOf = (page: { items: readonly { value: { noteId: string } }[] }) =>
  page.items.map(({ value }) => value.noteId);

const same = (matched: readonly string[], expected: readonly string[]) =>
  JSON.stringify(matched) === JSON.stringify(expected);

export const sparseIndexes = Story.make({
  title: 'Sparse indexes',
  description:
    'A note that cannot make an index key stays out of that index. It is still readable everywhere else.',
  setupNote:
    'A second Note binding over the same table. Its index key uses a field that can hold null.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Most notes have a due date. Some have none. What happens to those notes in an index that uses the date?',
      {
        answer:
          'They stay out of that index. The index is sparse. The note is still stored, and a read by its primary key still returns it.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const pk = { notebook: 'work' } as const;
              const byDue = yield* note.query('byDue', { pk, '>=': null });
              const primary = yield* note.query('primary', { pk, '>=': null });
              const undated = yield* note.get({
                noteId: 'n2',
                notebook: 'work',
              });
              return {
                byDue: idsOf(byDue),
                primary: idsOf(primary),
                undated: undated === null ? 'missing' : undated.value.dueOn,
              };
            }),
          );
          const found = results.sqlite;
          yield* Story.assert(
            'the row with a null component is absent from the index',
            same(found.byDue, ['n1', 'n3']),
          );
          yield* Story.assert(
            'the same row is still stored and readable by primary key',
            same(found.primary, ['n1', 'n2', 'n3']) && found.undated === null,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
