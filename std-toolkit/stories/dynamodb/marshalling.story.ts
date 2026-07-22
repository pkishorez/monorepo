import { strict as assert } from 'node:assert';

import { Effect } from 'effect';
import { functionBlock } from 'laymos/story';

import { dynamodbSerializationStories } from './support/story-groups.js';

import { marshall, unmarshall } from '../../src/db/dynamodb/index.js';

const roundTrip = functionBlock(
  'Marshall and unmarshall a value',
  {
    description:
      'Converts JavaScript values to DynamoDB AttributeValue form and decodes them back.',
    attributes: (input: Record<string, unknown>) => ({
      fields: Object.keys(input),
    }),
  },
  (input: Record<string, unknown>) =>
    Effect.succeed(unmarshall(marshall(input))),
);

dynamodbSerializationStories
  .story('Marshall values', {
    description:
      'Shows stable round trips for the public DynamoDB value conversion utilities.',
  })
  .execute(roundTrip)
  .scenario(
    'primitive values survive a round trip',
    { description: 'Preserves strings, numbers, booleans, and null.' },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({ name: 'Ada', age: 42, active: true, note: null }),
        )
        .verify((result, prepared) =>
          Effect.sync(() => assert.deepEqual(result, prepared)),
        ),
  )
  .scenario(
    'nested records and lists survive a round trip',
    {
      description:
        'Preserves nested application data without flattening its structure.',
    },
    (scenario) =>
      scenario
        .prepare(() =>
          Effect.succeed({ profile: { city: 'Pune' }, tags: ['one', 'two'] }),
        )
        .verify((result, prepared) =>
          Effect.sync(() => assert.deepEqual(result, prepared)),
        ),
  );
