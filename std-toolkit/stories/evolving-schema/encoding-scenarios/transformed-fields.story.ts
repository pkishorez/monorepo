import { Effect, Schema, SchemaTransformation } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const StoredNumber = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Number,
    SchemaTransformation.transform({
      decode: (value) => Number(value),
      encode: (value) => String(value),
    }),
  ),
);

const Note = ESchema.make('Note', {
  text: Schema.String,
  wordCount: StoredNumber,
})
  .evolve('v2', { long: Schema.Boolean }, (previous) => ({
    ...previous,
    long: previous.wordCount > 100,
  }))
  .build();

export const transformedFields = Story.make({
  title: 'Fields that change shape in storage',
  description:
    'A field is stored as text and used as a number. This Story shows which side a migration sees.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The word count of the note is stored as text. Which side does a migration see?',
      {
        answer:
          'The decoded side, always. Each field decodes before any step runs. The migration therefore receives a number and can calculate with it.',
        proof: Effect.gen(function* () {
          const note = yield* Note.decode({
            _v: 'v1',
            text: 'Buy milk',
            wordCount: '140',
          });
          yield* Story.assert(
            'the field arrived as a number',
            note.wordCount === 140,
          );
          yield* Story.assert(
            'the migration computed with that number',
            note.long === true,
          );
          return note;
        }),
      },
    ),
    Story.question('What goes back into storage?', {
      answer:
        'The stored form. Each field encodes on the way in, so the count becomes text again.',
      proof: Effect.gen(function* () {
        const note = yield* Note.decode({
          _v: 'v1',
          text: 'Buy milk',
          wordCount: '140',
        });
        const stored = yield* Note.encode(note);
        yield* Story.assert(
          'the stored side is text again',
          stored.wordCount === '140',
        );
        yield* Story.assert(
          'stamped at the latest version',
          stored._v === 'v2',
        );
        return stored;
      }),
    }),
  ],
});
