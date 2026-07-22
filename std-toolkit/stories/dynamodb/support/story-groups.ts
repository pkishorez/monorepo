import { storyGroup } from 'laymos/story';

export const dynamodbStories = storyGroup('DynamoDB', {
  description:
    'How std-toolkit models, stores, retrieves, and transforms data with DynamoDB.',
});

export const dynamodbEntityStories = dynamodbStories.group('Entities', {
  description:
    'Lifecycle, querying, migration, and transaction behavior for typed entities.',
});

export const dynamodbSingleEntityStories = dynamodbStories.group(
  'Single entities',
  {
    description:
      'Read and write behavior for schemas that own one record rather than a keyed collection.',
  },
);

export const dynamodbTableStories = dynamodbStories.group('Tables', {
  description:
    'Low-level item, query, scan, batch, and table-management behavior.',
});

export const dynamodbSerializationStories = dynamodbStories.group(
  'Serialization',
  {
    description:
      'Conversion between JavaScript values and DynamoDB attribute values.',
  },
);

export const dynamodbDeferredStories = dynamodbStories.group('Deferred', {
  description:
    'Useful DynamoDB checks awaiting a coherent executable Story flow.',
});
