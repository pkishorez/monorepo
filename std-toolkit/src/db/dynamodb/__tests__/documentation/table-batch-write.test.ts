import { Effect } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('table-batch-write');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Table', () => {
    laymosDescribe(
      'Batch write',
      {
        description:
          'Batch write splits raw items into DynamoDB-sized requests and reports retries.',
        documentation: operationDocumentation(
          'Use `batchWrite` for throughput-oriented raw table writes.',
          `const result = yield* table.batchWrite(items)`,
          'The operation is not atomic. Unprocessed indexes identify original inputs that need retrying.',
        ),
      },
      () => {
        laymosTest(
          'Saves a batch larger than one DynamoDB request.',
          {
            description:
              'The caller submits 26 items, which is larger than DynamoDB accepts in one batch request. The toolkit should split the work while still saving every item.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              const items = Array.from({ length: 26 }, (_, index) => ({
                pk: `BATCH#${String(index).padStart(2, '0')}`,
                sk: 'ITEM',
                value: index,
              }));

              const result = yield* trace(
                harness.provide(harness.table.batchWrite(items)),
              );
              const stored = yield* harness.provide(harness.table.scan());

              expect(
                stored.Items.length,
                'All 26 submitted items are saved.',
              ).toBe(26);
              expect(
                result.unprocessedIndexes,
                'No submitted item needs to be retried.',
              ).toEqual([]);
            }),
        );
      },
    );
  });
});
