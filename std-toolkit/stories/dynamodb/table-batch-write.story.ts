import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-batch-write');
type Input = Parameters<typeof harness.table.batchWrite>[0];
const batchWriteItems = functionBlock(
  'Batch write raw items',
  {
    description:
      'Writes one supplied raw collection through the public table batch flow.',
    attributes: (input: Input) => ({ items: input.length }),
  },
  (input: Input) => harness.table.batchWrite(input),
);

dynamodbTableStories
  .story('Batch write items', {
    description: 'Shows chunking and completion for one raw batch-write flow.',
  })
  .provide(harness.layer)
  .execute(batchWriteItems)
  .scenario(
    'batch write crosses the twenty-five item limit',
    { description: 'Writes thirty raw items as one public call.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            Array.from({ length: 30 }, (_, index) => ({
              pk: 'BATCH',
              sk: `ITEM#${String(index).padStart(2, '0')}`,
              value: index,
            })),
          ),
        )
        .verify((result) =>
          harness.table.scan().pipe(
            Effect.tap((scan) =>
              Effect.sync(() => {
                assert.deepEqual(result.unprocessedIndexes, []);
                assert.equal(scan.Items.length, 30);
              }),
            ),
          ),
        )
        .cleanup(harness.cleanup),
  );
