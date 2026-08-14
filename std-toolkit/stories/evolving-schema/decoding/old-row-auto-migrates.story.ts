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
  title: 'What happens when an old row meets the latest schema?',
  description:
    'It migrates automatically, on read — the caller never knows the row was old.',
  sourceUrl: import.meta.url,
  markdown: `
## Given

A v1 row persisted long before \`tags\` existed:

\`\`\`ts
// in storage since January
{ _v: 'v1', title: 'On computable numbers' }
\`\`\`

## Question

The code calling \`Article.decode\` today only knows the v2 shape. Who is
responsible for upgrading the old row?

## Answer

Nobody — it happens inside \`decode\`. The runtime reads the \`_v\` stamp,
decodes the payload with **v1's** schema (the shape it actually has), then
applies the v1→v2 migration before returning. The caller receives the latest
shape and cannot tell the row was ever old.

\`\`\`ts
const article = yield* Article.decode(storedRow);
// { title: 'On computable numbers', tags: [] }
\`\`\`

This is the heart of the whole design: **migration is a read-side concern**.
The database is never rewritten; every reader sees the present.
`,
  run: Effect.gen(function* () {
    const article = yield* Story.trace(
      'read a January row with December code',
      Effect.gen(function* () {
        yield* Effect.log('Stored row is v1: no tags field anywhere');
        const decoded = yield* Article.decode({
          _v: 'v1',
          title: 'On computable numbers',
        });
        yield* Effect.log(
          'decode dispatched on _v, then folded the row forward',
        );
        return decoded;
      }).pipe(Effect.withSpan('decode-old-article')),
    );
    yield* Story.assert(
      'the caller sees the latest shape',
      Array.isArray(article.tags),
    );
    yield* Story.assert(
      'the original data is intact',
      article.title === 'On computable numbers',
    );
    yield* Story.assert(
      'no version stamp leaks into the decoded value',
      !('_v' in article),
    );
  }),
});
