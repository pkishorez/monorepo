import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { exprFilter } from '../../src/db/dynamodb/index.js';
import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-query');
type Input = {
  readonly sk?: { readonly between: [string, string] };
  readonly activeOnly?: boolean;
};

const queryRawItems = functionBlock(
  'Query raw items',
  {
    description:
      'Queries one raw partition through the public table query flow.',
  },
  (input: Input) =>
    harness.table.query(
      { pk: 'GROUP#one', ...(input.sk ? { sk: input.sk } : {}) },
      input.activeOnly
        ? {
            filter: exprFilter<{ active: boolean }>(($) =>
              $.cond('active', '=', true),
            ),
          }
        : undefined,
    ),
);

const seedItems = Effect.all([
  harness.table.putItem({ pk: 'GROUP#one', sk: 'ITEM#1', active: true }),
  harness.table.putItem({ pk: 'GROUP#one', sk: 'ITEM#2', active: false }),
  harness.table.putItem({ pk: 'GROUP#one', sk: 'ITEM#3', active: true }),
]);

dynamodbTableStories
  .story('Query items', {
    description: 'Shows bounds and filtering through one raw table query flow.',
  })
  .provide(harness.layer)
  .execute(queryRawItems)
  .scenario(
    'between query returns inclusive ordered bounds',
    { description: 'Queries between two sort keys.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare<Input>(
            { sk: { between: ['ITEM#1', 'ITEM#3'] } },
            seedItems,
          ),
        )
        .verify((result) =>
          Effect.sync(() =>
            assert.deepEqual(
              result.Items.map((item) => item.sk),
              ['ITEM#1', 'ITEM#2', 'ITEM#3'],
            ),
          ),
        )
        .cleanup(harness.cleanup),
  )
  .scenario(
    'filter removes nonmatching query results',
    { description: 'Applies a post-query active-item predicate.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare<Input>({ activeOnly: true }, seedItems))
        .verify((result) =>
          Effect.sync(() => assert.equal(result.Items.length, 2)),
        )
        .cleanup(harness.cleanup),
  );
