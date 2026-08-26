import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

export const codecFields = Story.make({
  title: 'Codec fields',
  description:
    'A field schema must survive a Snapshot round trip. A custom encode/decode transform cannot, so defining one is refused up front.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note carries a reminder date stored as text and read back as a `Date`. Can a field schema do that conversion?',
      {
        answer:
          'No. A Snapshot must be able to capture a field and restore a live, working schema from that capture alone. A custom encode/decode transform — a date parsed from text, a list joined into one string — cannot be restored that way, so `EntityESchema.make` refuses it the moment the field is declared.',
        proof: Effect.gen(function* () {
          const attempt = Effect.try(() =>
            EntityESchema.make('Note', 'noteId', {
              notebook: Schema.String,
              remindAt: Schema.DateFromString,
            }).build(),
          );
          const failure = yield* Effect.flip(attempt);
          const cause = failure.cause;
          yield* Story.assert(
            'the field is refused at definition time, not at snapshot time',
            cause instanceof Error &&
              cause.name === 'UnrepresentableFieldError' &&
              cause.message.includes('remindAt'),
          );
          return { message: (cause as Error).message };
        }),
      },
    ),
    Story.question('What does work, then?', {
      answer:
        'A structural field: an object, a primitive, a literal, a union, an array, an enum, a template literal, or a branded value. Store the date as the string it already is, or the tag list as the array it already is, and convert at the call site if you need a richer type there.',
      proof: Effect.gen(function* () {
        const schema = EntityESchema.make('Note', 'noteId', {
          notebook: Schema.String,
          remindAt: Schema.String,
          tags: Schema.Array(Schema.String),
        }).build();

        const encoded = yield* schema.encode({
          noteId: 'b1',
          notebook: 'oak',
          remindAt: '2026-05-01T09:00:00.000Z',
          tags: ['weekly', 'team'],
        });
        yield* Story.assert(
          'the structural field encodes and stays a plain string',
          encoded.remindAt === '2026-05-01T09:00:00.000Z',
        );
        return { encoded };
      }),
    }),
  ],
});
