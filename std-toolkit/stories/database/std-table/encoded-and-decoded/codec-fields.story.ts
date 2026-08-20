import { Effect, Schema, SchemaTransformation } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, parity } from '../../support.js';

const TagList = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Array(Schema.String),
    SchemaTransformation.transform({
      decode: (stored): readonly string[] =>
        stored === '' ? [] : stored.split('|'),
      encode: (tags: readonly string[]) => tags.join('|'),
    }),
  ),
);

const ReminderNoteSchema = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  remindAt: Schema.DateFromString,
  tags: TagList,
}).build();

const notesTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const note = notesTable
  .entity(ReminderNoteSchema)
  .primary({ pk: ['notebook'] })
  .index('LSI1', 'byReminder', { sk: ['remindAt'] })
  .build();

// A second binding over the same physical table, typed as raw strings. It reads
// the bytes the adapter actually holds, so the encoded side is observable.
const storedTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const storedNote = storedTable
  .entity(
    EntityESchema.make('Note', 'noteId', {
      notebook: Schema.String,
      remindAt: Schema.String,
      tags: Schema.String,
    }).build(),
  )
  .primary({ pk: ['notebook'] })
  .build();

const key = { noteId: 'b1', notebook: 'oak' };

const standup = {
  ...key,
  remindAt: new Date('2026-05-01T09:00:00.000Z'),
  tags: ['weekly', 'team'],
};

export const codecFields = Story.make({
  title: 'Codec fields',
  description:
    'A date goes in as a date and comes back as a date. The adapter does the conversion.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note carries a reminder date and a list of tags. What shape goes in, and what comes back?',
      {
        answer:
          'The decoded shape both times. `remindAt` goes in as a date and comes back as a date. `tags` goes in as a list and comes back as a list. The adapter encodes the value on the way in and decodes it on the way out.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* note.insert(standup);
              const read = yield* note.get(key);
              return {
                isDate: read?.value.remindAt instanceof Date,
                remindAt: read?.value.remindAt.toISOString() ?? null,
                tags: read?.value.tags ?? null,
              };
            }),
          );
          yield* Story.assert(
            'the read hands back live Date and array values',
            results.sqlite.isDate &&
              results.sqlite.remindAt === '2026-05-01T09:00:00.000Z' &&
              JSON.stringify(results.sqlite.tags) ===
                JSON.stringify(['weekly', 'team']),
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('What is in the database?', {
      answer:
        'The encoded shape. The date is a text string and the list is one joined string. Each database stores the same bytes, so the codec decides the format, not the database.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(standup);
            const stored = yield* storedNote.get(key);
            return {
              remindAt: stored?.value.remindAt ?? null,
              tags: stored?.value.tags ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the stored row holds strings, not a Date or an array',
          results.sqlite.remindAt === '2026-05-01T09:00:00.000Z' &&
            results.sqlite.tags === 'weekly|team',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('Where is the schema version?', {
      answer:
        'On the encoded value only. `encode` adds `_v` next to the encoded fields. The value that you read carries no `_v`, in the value or in its metadata.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const inserted = yield* note.insert(standup);
            const encoded = yield* ReminderNoteSchema.encode(inserted.value);
            return {
              encodedVersion: encoded._v,
              encodedStartsAt: encoded.remindAt,
              valueHasVersion: Object.hasOwn(inserted.value, '_v'),
              metaHasVersion: Object.hasOwn(inserted.meta, '_v'),
            };
          }),
        );
        yield* Story.assert(
          'the version rides with the encoded value',
          results.sqlite.encodedVersion === 'v1' &&
            results.sqlite.encodedStartsAt === '2026-05-01T09:00:00.000Z',
        );
        yield* Story.assert(
          'nothing you read carries a version',
          !results.sqlite.valueHasVersion && !results.sqlite.metaHasVersion,
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('Which side does an index key use?', {
      answer:
        'The encoded side. The reminder index sorts on the stored text, and that text sorts in time order. The index therefore orders notes by time.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert({
              ...standup,
              noteId: 'b2',
              remindAt: new Date('2026-05-01T14:00:00.000Z'),
            });
            yield* note.insert(standup);
            yield* note.insert({
              ...standup,
              noteId: 'b3',
              remindAt: new Date('2026-04-30T16:00:00.000Z'),
            });
            const page = yield* note.query('byReminder', {
              pk: { notebook: 'oak' },
              '>=': null,
            });
            return page.items.map(({ value }) => value.noteId);
          }),
        );
        yield* Story.assert(
          'the index reads back in chronological order',
          JSON.stringify(results.sqlite) === JSON.stringify(['b3', 'b1', 'b2']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('What happens when one of those fields is updated?', {
      answer:
        'It makes the same trip. You give `getAndUpdate` a date. The row is written again with new text. The next read decodes it back to a date.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* note.insert(standup);
            const moved = yield* note.getAndUpdate(key, {
              remindAt: new Date('2026-05-02T09:30:00.000Z'),
            });
            const stored = yield* storedNote.get(key);
            const read = yield* note.get(key);
            return {
              updatedIsDate: moved.value.remindAt instanceof Date,
              stored: stored?.value.remindAt ?? null,
              read: read?.value.remindAt.toISOString() ?? null,
              tagsSurvived: read?.value.tags ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the new Date is stored encoded and read back decoded',
          results.sqlite.updatedIsDate &&
            results.sqlite.stored === '2026-05-02T09:30:00.000Z' &&
            results.sqlite.read === '2026-05-02T09:30:00.000Z',
        );
        yield* Story.assert(
          'the untouched codec field is unchanged',
          JSON.stringify(results.sqlite.tagsSurvived) ===
            JSON.stringify(['weekly', 'team']),
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
