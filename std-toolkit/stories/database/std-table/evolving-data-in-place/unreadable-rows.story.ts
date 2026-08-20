import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { StdTable } from 'std-toolkit/db';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, parity, reasonOf } from '../../support.js';

const foreignTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const ourTable = StdTable.make('std-table-stories')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const foreignArticle = foreignTable
  .entity(
    EntityESchema.make('Article', 'articleId', {
      section: Schema.String,
      title: Schema.Number,
    }).build(),
  )
  .primary({ pk: ['section'] })
  .build();

const article = ourTable
  .entity(
    EntityESchema.make('Article', 'articleId', {
      section: Schema.String,
      title: Schema.String,
    }).build(),
  )
  .primary({ pk: ['section'] })
  .build();

const key = { articleId: 'a1', section: 'news' };

export const unreadableRows = Story.make({
  title: 'Unreadable rows',
  description: 'Data that cannot be decoded fails at the row that holds it.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens when a stored row does not match the schema?',
      {
        answer:
          'The read fails and reports a decode error. It does not return a value that it guessed. The fault therefore appears at the row that holds it.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* foreignArticle.insert({ ...key, title: 7 });
              const failure = yield* article.get(key).pipe(Effect.flip);
              return { reason: reasonOf(failure) };
            }),
          );
          yield* Story.assert(
            'the mismatched row fails to decode',
            results.sqlite.reason === 'DecodeFailed',
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
    Story.question('Does one unreadable row affect the other rows?', {
      answer:
        'No. The failure stays at that row. Each other row in the same partition reads normally.',
      proof: Effect.gen(function* () {
        const results = yield* parity(
          Effect.gen(function* () {
            yield* foreignArticle.insert({ ...key, title: 7 });
            yield* article.insert({
              articleId: 'a2',
              section: 'news',
              title: 'Tides',
            });
            const failure = yield* article.get(key).pipe(Effect.flip);
            const neighbour = yield* article.get({
              articleId: 'a2',
              section: 'news',
            });
            return {
              reason: reasonOf(failure),
              neighbour: neighbour?.value.title ?? null,
            };
          }),
        );
        yield* Story.assert(
          'only the bad row fails while its neighbour reads',
          results.sqlite.reason === 'DecodeFailed' &&
            results.sqlite.neighbour === 'Tides',
        );
        yield* Story.assert('every adapter agrees', agree(results));
        return results;
      }),
    }),
  ],
});
