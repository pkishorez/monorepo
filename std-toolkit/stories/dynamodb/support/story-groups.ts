import { storyGroup } from 'laymos/story';

export const dynamodbStories = storyGroup('DynamoDB', {
  description:
    'How std-toolkit models, stores, retrieves, and transforms data with DynamoDB.',
});

export const dynamodbEntityStories = dynamodbStories.group('Entities', {
  description:
    'Reading, writing, querying, migration, deletion, and restoration behavior for typed entities.',
});

export const dynamodbSingleEntityStories = dynamodbStories.group(
  'Single Entity',
  {
    description:
      'Read and write behavior for schemas that own one record rather than a keyed collection.',
  },
);
