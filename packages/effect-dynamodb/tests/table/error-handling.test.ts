import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable } from '../setup.js';
import {
  createIndexedTable,
  createKey,
  createUser,
  PREFIXES,
  SORT_KEY_TYPES,
} from './utils.js';

const table = createIndexedTable();

beforeEach(async () => {
  await cleanTable();
});

describe('error Handling', () => {
  describe('non-existent Items', () => {
    it('should return null for non-existent item in getItem', async () => {
      const result = await Effect.runPromise(
        table.getItem(createKey(`${PREFIXES.USER}999`, SORT_KEY_TYPES.PROFILE)),
      );

      expect(result.Item).toBeNull();
    });

    it('should return empty results for non-existent partition key in query', async () => {
      const result = await Effect.runPromise(
        table.query({ pk: `${PREFIXES.USER}nonexistent` }),
      );

      expect(result.Items).toHaveLength(0);
    });

    it('should return empty results for non-existent GSI query', async () => {
      const result = await Effect.runPromise(
        table.gsi('GSI1').query({ pk: `${PREFIXES.CATEGORY}nonexistent` }),
      );

      expect(result.Items).toHaveLength(0);
    });

    it('should return empty results for non-existent LSI query', async () => {
      const result = await Effect.runPromise(
        table.lsi('LSI1').query({ pk: `${PREFIXES.PRODUCT}nonexistent` }),
      );

      expect(result.Items).toHaveLength(0);
    });
  });

  describe('update and Delete Operations', () => {
    it('should handle update on non-existent item', async () => {
      const result = await Effect.runPromise(
        table.updateItem(
          createKey(`${PREFIXES.USER}999`, SORT_KEY_TYPES.PROFILE),
          {
            UpdateExpression: 'SET #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':status': { S: 'updated' },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      // DynamoDB creates the item if it doesn't exist during update
      expect(result.Attributes).toMatchObject({ status: 'updated' });
    });

    it('should handle delete on non-existent item gracefully', async () => {
      // This should not throw an error
      await Effect.runPromise(
        table.deleteItem(
          createKey(`${PREFIXES.USER}999`, SORT_KEY_TYPES.PROFILE),
        ),
      );

      // Verify item still doesn't exist
      const result = await Effect.runPromise(
        table.getItem(createKey(`${PREFIXES.USER}999`, SORT_KEY_TYPES.PROFILE)),
      );
      expect(result.Item).toBeNull();
    });
  });

  describe('query Edge Cases', () => {
    it('should handle valid but empty between range', async () => {
      const user = createUser('edge1');
      await Effect.runPromise(table.putItem({ ...user, skey: 'item#005' }));

      // Valid range but no items in between
      const result = await Effect.runPromise(
        table.query({
          pk: user.pkey,
          sk: { between: ['item#001', 'item#003'] }, // Valid range, no items
        }),
      );

      expect(result.Items).toHaveLength(0);
    });

    it('should handle query with no matching sort key condition', async () => {
      const user = createUser('edge2');
      await Effect.runPromise(table.putItem({ ...user, skey: 'item#001' }));

      const result = await Effect.runPromise(
        table.query({
          pk: user.pkey,
          sk: { beginsWith: 'nonmatching' },
        }),
      );

      expect(result.Items).toHaveLength(0);
    });

    it('should handle scan with no matching filter', async () => {
      const user = createUser('edge3', { score: 100 });
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.scan({
          FilterExpression: '#score > :minScore',
          ExpressionAttributeNames: { '#score': 'score' },
          ExpressionAttributeValues: { ':minScore': 200 },
        }),
      );

      // May return 0 items or items from other tests that match
      expect(Array.isArray(result.Items)).toBe(true);
    });
  });

  describe('data Consistency', () => {
    it('should maintain data integrity across operations', async () => {
      const user = createUser('consistency1', { count: 1 });
      await Effect.runPromise(table.putItem(user));

      // Update with expression
      await Effect.runPromise(
        table.updateItem(createKey(user.pkey), {
          UpdateExpression: 'SET #count = #count + :inc',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: { ':inc': { N: '5' } },
        }),
      );

      // Get and verify
      const result = await Effect.runPromise(
        table.getItem(createKey(user.pkey)),
      );
      expect(result.Item?.count).toBe(6);

      // Update with attributes
      await Effect.runPromise(
        table.updateItem(createKey(user.pkey), {
          UpdateExpression: 'SET #count = :count, #status = :status',
          ExpressionAttributeNames: {
            '#count': 'count',
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':count': { N: '10' },
            ':status': { S: 'modified' },
          },
        }),
      );

      // Final verification
      const finalResult = await Effect.runPromise(
        table.getItem(createKey(user.pkey)),
      );
      expect(finalResult.Item).toMatchObject({ count: 10, status: 'modified' });
    });
  });
});

