import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-put-item');
const key = { pk: 'RAW#one', sk: 'ITEM#one' };
type Input = { readonly value: string };

const putRawItem = functionBlock(
  'Put a raw item',
  {
    description:
      'Writes one complete item through the public raw table put flow.',
  },
  (input: Input) => harness.table.putItem({ ...key, value: input.value }),
);

dynamodbTableStories
  .story('Put an item', {
    description: 'Shows a complete raw item write and its persisted result.',
  })
  .provide(harness.layer)
  .execute(putRawItem)
  .scenario(
    'put persists the raw item',
    { description: 'Writes an unencoded application item.' },
    (scenario) =>
      scenario
        .prepare(() => harness.prepare({ value: 'stored' }))
        .verify(() =>
          harness.table
            .getItem(key)
            .pipe(
              Effect.tap((result) =>
                Effect.sync(() => assert.equal(result.Item?.value, 'stored')),
              ),
            ),
        )
        .cleanup(harness.cleanup),
  );
