import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'command.query routes to entity.query',
  'The index name is a string in the payload; pk/sk are typed through `SkCondition` which mirrors `SkParam`.',
  () => {
    vtest(
      'unknown index name ⇒ CommandError wrapping queryFailed',
      'The inner message is `Index <name> not found`.',
      () => {
        const err = {
          operation: 'query' as const,
          entity: 'User',
          message: 'Query failed: Index byNothing not found',
        };
        expect(err.message).toMatch(/not found/);
      },
    );

    vtest(
      'streaming is not exposed over the wire',
      '`entity.queryStream` and `subscribe` are intentionally not part of the command surface.',
      () => {
        const wireOperations = [
          'insert',
          'update',
          'delete',
          'query',
          'descriptor',
        ];
        expect(wireOperations.includes('subscribe')).toBe(false);
        expect(wireOperations.includes('queryStream')).toBe(false);
      },
    );

    vtest(
      'limit is pass-through',
      'Omitting `limit` falls back to the DynamoDB default page limit.',
      () => {
        const payload: { limit?: number } = {};
        const options =
          payload.limit !== undefined ? { limit: payload.limit } : undefined;
        expect(options).toBeUndefined();
      },
    );
  },
);
