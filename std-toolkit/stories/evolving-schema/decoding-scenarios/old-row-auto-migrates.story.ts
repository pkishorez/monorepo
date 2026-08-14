import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { ESchema } from 'std-toolkit/eschema';

const Article = ESchema.make('Article', {
  title: Schema.String,
})
  .evolve('v2', { tags: Schema.Array(Schema.String) }, (previous) => ({
    ...previous,
    tags: [],
  }))
  .build();

export const oldRowAutoMigrates = Story.make({
  title: 'Old row auto-migrates',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a v1 row is decoded by code that only knows v2?',
      {
        answer:
          'It migrates inside `decode`: the runtime dispatches on `_v`, decodes with the v1 schema, then folds forward to the latest shape.',
        proof: Effect.gen(function* () {
          const article = yield* Article.decode({
            _v: 'v1',
            title: 'On computable numbers',
          });
          yield* Story.assert(
            'the caller sees the latest shape',
            Array.isArray(article.tags),
          );
          yield* Story.assert(
            'the original data is intact',
            article.title === 'On computable numbers',
          );
          return article;
        }),
      },
    ),
    Story.question('Does the version stamp leak into the decoded value?', {
      answer:
        'No — `_v` is a storage concern and is stripped before the value is returned.',
      proof: Effect.gen(function* () {
        const article = yield* Article.decode({
          _v: 'v1',
          title: 'On computable numbers',
        });
        yield* Story.assert(
          'no version stamp on the decoded value',
          !('_v' in article),
        );
        return article;
      }),
    }),
  ],
});
