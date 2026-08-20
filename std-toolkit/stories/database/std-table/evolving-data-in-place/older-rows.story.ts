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

const lastYearsNote = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
}).build();

const todaysNote = EntityESchema.make('Note', 'noteId', {
  notebook: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { summary: Schema.NullOr(Schema.String) }, (previous) => ({
    ...previous,
    summary: `About ${previous.title}`,
  }))
  .build();

const oldArticle = lastYearsTable
  .entity(lastYearsNote)
  .primary({ pk: ['notebook'] })
  .build();

const article = todaysTable
  .entity(todaysNote)
  .primary({ pk: ['notebook'] })
  .build();

const key = { noteId: 'a1', notebook: 'news' };

export const olderRows = Story.make({
  title: 'Older rows',
  description:
    'A note written against an older schema moves forward as it is read. Storage does not change.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'A note was written last year, before the schema had a field. What does a read return today?',
      {
        answer:
          'The note moves forward in memory. The migration adds the new field before you see it. The value carries no `_v`, and the read does not change the stored row.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* oldArticle.insert({ ...key, title: 'Tides' });
              const stored = yield* article.get(key);
              const oldReaderCanStillRead = yield* oldArticle
                .get(key)
                .pipe(Effect.as(true));
              return {
                summary: stored?.value.summary ?? null,
                decodedHasVersion: Object.hasOwn(stored?.meta ?? {}, '_v'),
                oldReaderCanStillRead,
              };
            }),
          );
          yield* Story.assert(
            'the migration fills the field without changing the stored row',
            results.sqlite.summary === 'About Tides' &&
              !results.sqlite.decodedHasVersion &&
              results.sqlite.oldReaderCanStillRead,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('What happens after that note is edited and saved?', {
      answer:
        'The write stores the whole row at the newest version. The value that you read still carries no `_v`.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* oldArticle.insert({ ...key, title: 'Tides' });
            const before = yield* article.get(key);
            const updated = yield* article.getAndUpdate(key, {
              summary: 'Written by hand',
            });
            const after = yield* article.get(key);
            const oldReader = yield* oldArticle.get(key).pipe(Effect.result);
            return {
              beforeHasVersion: Object.hasOwn(before?.meta ?? {}, '_v'),
              updatedHasVersion: Object.hasOwn(updated.meta, '_v'),
              afterHasVersion: Object.hasOwn(after?.meta ?? {}, '_v'),
              oldReaderRejectedLatest: oldReader._tag === 'Failure',
              summary: after?.value.summary ?? null,
            };
          }),
        );
        yield* Story.assert(
          'only the encoded row carries the new version',
          !results.sqlite.beforeHasVersion &&
            !results.sqlite.updatedHasVersion &&
            !results.sqlite.afterHasVersion &&
            results.sqlite.oldReaderRejectedLatest,
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
