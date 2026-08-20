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
  description: 'Add a rung; never reach back and change one.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to the oldest v1 row after two versions are appended?',
      {
        answer:
          'It still decodes — the untouched v1 shape enters the longer chain and arrives at v3 with `wordCount` backfilled.',
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
    Story.question('What happens to a mid-chain v2 row?', {
      answer:
        'It keeps its own data and gains only the v3 fields — appending changes nothing it depends on.',
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
    Story.question('Do all vintages end up at the same shape?', {
      answer:
        'Yes — a v1, v2, and v3 row all decode to the same v3 shape with `wordCount` present.',
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
