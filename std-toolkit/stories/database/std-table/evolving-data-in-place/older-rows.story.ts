import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, parity } from '../../support.js';

const lastYearsTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const todaysTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const lastYearsArticle = EntityESchema.make('Article', 'articleId', {
  section: Schema.String,
  title: Schema.String,
}).build();

const todaysArticle = EntityESchema.make('Article', 'articleId', {
  section: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { summary: Schema.NullOr(Schema.String) }, (previous) => ({
    ...previous,
    summary: `About ${previous.title}`,
  }))
  .build();

const oldArticle = lastYearsTable
  .entity(lastYearsArticle)
  .primary({ pk: ['section'] })
  .build();

const article = todaysTable
  .entity(todaysArticle)
  .primary({ pk: ['section'] })
  .build();

const key = { articleId: 'a1', section: 'news' };

export const olderRows = Story.make({
  title: 'Older rows',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when you read a row that an older version of the schema wrote?',
      {
        answer:
          'The row folds forward on read — the migration fills the new field before you see the value, while `meta._v` still reports the version the row was stored at.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* oldArticle.insert({ ...key, title: 'Tides' });
              const stored = yield* article.get(key);
              return {
                summary: stored?.value.summary ?? null,
                version: stored?.meta._v ?? null,
              };
            }),
          );
          yield* Story.assert(
            'the migration fills the new field on a row still stamped v1',
            results.sqlite.summary === 'About Tides' &&
              results.sqlite.version === 'v1',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('What is written back when you update a migrated row?', {
      answer:
        'The whole row is rewritten at the latest version, so `meta._v` moves from v1 to v2 and the migration never runs on it again.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* oldArticle.insert({ ...key, title: 'Tides' });
            const before = yield* article.get(key);
            const updated = yield* article.getAndUpdate(key, {
              summary: 'Written by hand',
            });
            const after = yield* article.get(key);
            return {
              before: before?.meta._v ?? null,
              updated: updated.meta._v,
              after: after?.meta._v ?? null,
              summary: after?.value.summary ?? null,
            };
          }),
        );
        yield* Story.assert(
          'the stored version stamp moves from v1 to v2',
          results.sqlite.before === 'v1' &&
            results.sqlite.updated === 'v2' &&
            results.sqlite.after === 'v2',
        );
        yield* Story.assert(
          'the hand-written value survives the rewrite',
          results.sqlite.summary === 'Written by hand',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
