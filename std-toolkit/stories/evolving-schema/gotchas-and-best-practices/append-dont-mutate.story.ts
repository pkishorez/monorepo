import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Document = ESchema.make('Document', {
  body: Schema.String,
})
  .evolve('v2', { author: Schema.String }, (previous) => ({
    ...previous,
    author: 'unknown',
  }))
  .evolve('v3', { wordCount: Schema.Number }, (previous) => ({
    ...previous,
    wordCount: previous.body.split(/\s+/).length,
  }))
  .build();

export const appendDontMutate = Story.make({
  title: "Append, don't mutate",
  description: 'Add a step. Do not change a step that has shipped.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to the oldest v1 row after two more versions are added?',
      {
        answer:
          'It still decodes. The v1 shape did not change, so the row runs the longer sequence and arrives at v3.',
        proof: Effect.gen(function* () {
          const ancient = yield* Document.decode({
            _v: 'v1',
            body: 'hello old world',
          });
          yield* Story.assert(
            'a v1 row still decodes after two appends',
            ancient.wordCount === 3,
          );
          return ancient;
        }),
      },
    ),
    Story.question('What happens to a v2 row in the middle?', {
      answer:
        'It keeps its own data and gains the v3 fields only. Adding a step does not affect anything that the row depends on.',
      proof: Effect.gen(function* () {
        const middleAged = yield* Document.decode({
          _v: 'v2',
          body: 'hello',
          author: 'ada',
        });
        yield* Story.assert(
          'a v2 row keeps its own data and gains v3 fields',
          middleAged.author === 'ada' && middleAged.wordCount === 1,
        );
        return middleAged;
      }),
    }),
    Story.question('Do rows from each version reach the same shape?', {
      answer:
        'Yes. A v1 row, a v2 row, and a v3 row all decode to the same v3 shape.',
      proof: Effect.gen(function* () {
        const ancient = yield* Document.decode({ _v: 'v1', body: 'old' });
        const middleAged = yield* Document.decode({
          _v: 'v2',
          body: 'mid',
          author: 'ada',
        });
        const modern = yield* Document.decode({
          _v: 'v3',
          body: 'hi',
          author: 'grace',
          wordCount: 1,
        });
        yield* Story.assert(
          'all vintages arrive at the same shape',
          'wordCount' in ancient &&
            'wordCount' in middleAged &&
            'wordCount' in modern,
        );
        return { ancient, middleAged, modern };
      }),
    }),
  ],
});
