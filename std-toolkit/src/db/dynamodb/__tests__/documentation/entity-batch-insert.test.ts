import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('entity-batch-insert');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Batch insert',
      {
        description:
          'Batch insert writes independent domain entities in DynamoDB-sized requests.',
        documentation: operationDocumentation(
          'Use `batchInsert` for throughput-oriented independent writes.',
          `const result = yield* users.batchInsert([firstUser, secondUser])`,
          'Accepted entities and original retry indexes are returned separately. Use a transaction for all-or-nothing writes.',
        ),
      },
      () => {
        laymosTest(
          'Saves every user when DynamoDB accepts the complete batch.',
          {
            description:
              'Two independent users are submitted together and DynamoDB accepts both. The result should report both users as saved and nothing as needing another attempt.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;

              const result = yield* trace(
                harness.provide(
                  harness.users.batchInsert([user('batch-a'), user('batch-b')]),
                ),
              );

              expect(
                result.written.map(({ value }) => value.userId),
                'Both submitted users are reported as saved.',
              ).toEqual(['batch-a', 'batch-b']);
              expect(
                result.unprocessedIndexes,
                'No submitted user needs to be retried.',
              ).toEqual([]);
            }),
        );
      },
    );
  });
});
