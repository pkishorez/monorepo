import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbTableStories } from './support/story-groups.js';

import { makeDynamoStoryHarness } from './support/dynamodb-story-harness.js';

const harness = makeDynamoStoryHarness('table-remove-all');
const removeAllItems = functionBlock(
  'Remove all table items',
  {
    description:
      'Runs the explicitly acknowledged destructive table cleanup flow.',
  },
  (_input: {}) =>
    harness.table.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING'),
);

dynamodbTableStories
  .story('Remove all items', {
    description:
      'Shows the complete destructive cleanup flow on an isolated table.',
  })
  .provide(harness.layer)
  .execute(removeAllItems)
  .scenario(
    'remove all empties the isolated table',
    { description: 'Removes three prepared raw items.' },
    (scenario) =>
      scenario
        .prepare(() =>
          harness.prepare(
            {},
            Effect.all([
              harness.table.putItem({ pk: 'CLEAR', sk: 'ONE' }),
              harness.table.putItem({ pk: 'CLEAR', sk: 'TWO' }),
              harness.table.putItem({ pk: 'CLEAR', sk: 'THREE' }),
            ]),
          ),
        )
        .verify((result) =>
          harness.table.scan().pipe(
            Effect.tap((scan) =>
              Effect.sync(() => {
                assert.equal(result.itemsDeleted, 3);
                assert.deepEqual(scan.Items, []);
              }),
            ),
          ),
        )
        .cleanup(harness.cleanup),
  );
