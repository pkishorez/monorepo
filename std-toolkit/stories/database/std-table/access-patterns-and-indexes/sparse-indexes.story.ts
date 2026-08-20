import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

import { agree, parity, table } from '../../support.js';

const TagSchema = EntityESchema.make('Tag', 'tagId', {
  workspace: Schema.String,
  group: Schema.String,
  label: Schema.NullOr(Schema.String),
}).build();

const tag = table
  .entity(TagSchema)
  .primary({ pk: ['workspace'] })
  .index('GSI1', 'byGroup', { pk: ['workspace'], sk: ['group', 'label'] })
  .build();

const tags = [
  { tagId: 't1', workspace: 'main', group: 'colour', label: 'amber' },
  { tagId: 't2', workspace: 'main', group: 'colour', label: null },
  { tagId: 't3', workspace: 'main', group: 'colour', label: 'blue' },
];

const seed = Effect.forEach(tags, (value) => tag.insert(value));

const idsOf = (page: { items: readonly { value: { tagId: string } }[] }) =>
  page.items.map(({ value }) => value.tagId);

const same = (matched: readonly string[], expected: readonly string[]) =>
  JSON.stringify(matched) === JSON.stringify(expected);

export const sparseIndexes = Story.make({
  title: 'Sparse indexes',
  description:
    'A row that cannot form an index key is left out of that index and stays readable everywhere else.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'What happens to a row that has no value for an index component?',
      {
        answer:
          'It is left out of that index entirely — the index is sparse — while the row itself stays stored and readable by its primary key.',
        proof: Effect.gen(function* () {
          const results = yield* parity(
            Effect.gen(function* () {
              yield* seed;
              const pk = { workspace: 'main' } as const;
              const byGroup = yield* tag.query('byGroup', { pk, '>=': null });
              const primary = yield* tag.query('primary', { pk, '>=': null });
              const unlabelled = yield* tag.get({
                tagId: 't2',
                workspace: 'main',
              });
              return {
                byGroup: idsOf(byGroup),
                primary: idsOf(primary),
                unlabelled:
                  unlabelled === null ? 'missing' : unlabelled.value.label,
              };
            }),
          );
          const found = results.sqlite;
          yield* Story.assert(
            'the row with a null component is absent from the index',
            same(found.byGroup, ['t1', 't3']),
          );
          yield* Story.assert(
            'the same row is still stored and readable by primary key',
            same(found.primary, ['t1', 't2', 't3']) &&
              found.unlabelled === null,
          );
          yield* Story.assert('every adapter agrees', agree(results));
          return results;
        }),
      },
    ),
  ],
});
