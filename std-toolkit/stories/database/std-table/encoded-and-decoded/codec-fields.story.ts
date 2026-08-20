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

const BookingSchema = EntityESchema.make('Booking', 'bookingId', {
  room: Schema.String,
  startsAt: Schema.DateFromString,
  tags: TagList,
}).build();

const bookingsTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const booking = bookingsTable
  .entity(BookingSchema)
  .primary({ pk: ['room'] })
  .index('LSI1', 'byStart', { sk: ['startsAt'] })
  .build();

// A second binding over the same physical table, typed as raw strings. It reads
// the bytes the adapter actually holds, so the encoded side is observable.
const storedTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const storedBooking = storedTable
  .entity(
    EntityESchema.make('Booking', 'bookingId', {
      room: Schema.String,
      startsAt: Schema.String,
      tags: Schema.String,
    }).build(),
  )
  .primary({ pk: ['room'] })
  .build();

const key = { bookingId: 'b1', room: 'oak' };

const standup = {
  ...key,
  startsAt: new Date('2026-05-01T09:00:00.000Z'),
  tags: ['weekly', 'team'],
};

export const codecFields = Story.make({
  title: 'Codec fields',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What shape do you hand to a write, and what shape comes back from a read?',
      {
        answer:
          'The decoded shape both times. `startsAt` goes in as a `Date` and comes back as a `Date`; `tags` goes in as an array and comes back as an array. Encoding happens on the way to the adapter and is undone on the way back.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* booking.insert(standup);
              const read = yield* booking.get(key);
              return {
                isDate: read?.value.startsAt instanceof Date,
                startsAt: read?.value.startsAt.toISOString() ?? null,
                tags: read?.value.tags ?? null,
              };
            }),
          );
          yield* Story.assert(
            'the read hands back live Date and array values',
            results.sqlite.isDate &&
              results.sqlite.startsAt === '2026-05-01T09:00:00.000Z' &&
              JSON.stringify(results.sqlite.tags) ===
                JSON.stringify(['weekly', 'team']),
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('What does the row actually hold?', {
      answer:
        'The encoded shape — an ISO string and a joined string. Every adapter stores the same portable bytes, so the codec, not the database, decides the storage format.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* booking.insert(standup);
            const stored = yield* storedBooking.get(key);
            return {
              startsAt: stored?.value.startsAt ?? null,
              tags: stored?.value.tags ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the stored row holds strings, not a Date or an array',
          results.sqlite.startsAt === '2026-05-01T09:00:00.000Z' &&
            results.sqlite.tags === 'weekly|team',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
    Story.question('Where does the version stamp live?', {
      answer:
        'On the encoded value, never on what you read. `encode` stamps `_v` alongside the encoded fields; the DecodedEntity carries neither a `_v` field nor a `_v` in its meta.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            const inserted = yield* booking.insert(standup);
            const encoded = yield* BookingSchema.encode(inserted.value);
            return {
              encodedVersion: encoded._v,
              encodedStartsAt: encoded.startsAt,
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
    Story.question('Which side do index keys come from?', {
      answer:
        'The encoded side. `byStart` sorts on the stored ISO string, which is lexicographically chronological, so the index orders bookings by time — a `Date` stringified any other way would not.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* booking.insert({
              ...standup,
              bookingId: 'b2',
              startsAt: new Date('2026-05-01T14:00:00.000Z'),
            });
            yield* booking.insert(standup);
            yield* booking.insert({
              ...standup,
              bookingId: 'b3',
              startsAt: new Date('2026-04-30T16:00:00.000Z'),
            });
            const page = yield* booking.query('byStart', {
              pk: { room: 'oak' },
              '>=': null,
            });
            return page.items.map(({ value }) => value.bookingId);
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
    Story.question('What happens to a codec field on update?', {
      answer:
        'It makes the same round trip. You hand `getAndUpdate` a `Date`, the row is rewritten with a fresh ISO string, and the next read decodes it back.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* booking.insert(standup);
            const moved = yield* booking.getAndUpdate(key, {
              startsAt: new Date('2026-05-02T09:30:00.000Z'),
            });
            const stored = yield* storedBooking.get(key);
            const read = yield* booking.get(key);
            return {
              updatedIsDate: moved.value.startsAt instanceof Date,
              stored: stored?.value.startsAt ?? null,
              read: read?.value.startsAt.toISOString() ?? null,
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
