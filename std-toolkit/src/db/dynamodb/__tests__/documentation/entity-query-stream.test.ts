import { Effect, Stream } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { afterAll, beforeAll, describe } from 'vitest';

import {
  makeDocumentationHarness,
  operationDocumentation,
  user,
} from './documentation-harness.js';

const harness = makeDocumentationHarness('entity-query-stream');

beforeAll(() => harness.create());
afterAll(() => harness.cleanup());

describe('DynamoDB', () => {
  describe('Entity', () => {
    laymosDescribe(
      'Query stream',
      {
        description:
          'Query stream reads every matching entity through bounded pages.',
        documentation: operationDocumentation(
          'Use `queryStream` when one partition should be consumed incrementally.',
          `const batches = users.queryStream('primary', { pk, sk: { '>': null } }, { batchSize: 2 })`,
          'The stream advances from the last item without repeating page boundaries.',
        ),
      },
      () => {
        laymosTest(
          'Reads every user once across multiple pages.',
          {
            description:
              'Three users are read with a page size of two. The stream should return two pages without skipping or repeating a user.',
          },
          ({ expect, trace }) =>
            Effect.gen(function* () {
              yield* harness.clear;
              yield* harness.provide(
                harness.users.batchInsert([
                  user('stream-a'),
                  user('stream-b'),
                  user('stream-c'),
                ]),
              );

              const chunks = yield* trace(
                harness.provide(
                  harness.users
                    .queryStream(
                      'primary',
                      {
                        pk: { organizationId: 'org-1' },
                        sk: { '>': null },
                      },
                      { batchSize: 2 },
                    )
                    .pipe(
                      Stream.runCollect,
                      Effect.map((values) =>
                        Array.from(values, (chunk) =>
                          chunk.map(({ value }) => value.userId),
                        ),
                      ),
                    ),
                ),
              );

              expect(
                chunks,
                'Each user appears once in the expected page.',
              ).toEqual([['stream-a', 'stream-b'], ['stream-c']]);
            }),
        );
      },
    );
  });
});
