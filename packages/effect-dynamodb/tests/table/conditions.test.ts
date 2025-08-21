import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from '../setup.js';

// Minimal test utilities
function createItem(id: string, overrides: Record<string, any> = {}) {
  return {
    pkey: `user#${id}`,
    skey: 'profile',
    name: `User ${id}`,
    email: `user${id}@test.com`,
    status: 'active',
    version: 1,
    ...overrides,
  };
}

const createKey = (pkey: string, skey: string = 'profile') => ({ pkey, skey });

beforeEach(async () => {
  await cleanTable();
});

describe('condition and Filter Expressions', () => {
  describe('conditionExpression for CRUD Operations', () => {
    it('should use condition for putItem', async () => {
      const item = createItem('001');

      // First put should succeed with condition that pkey doesn't exist
      await Effect.runPromise(
        table.putItem(item, {
          condition: {
            attr: 'pkey',
            condition: { type: 'exists', value: false },
          },
        }),
      );

      // Second put with same condition should fail since item now exists
      const putPromise = Effect.runPromise(
        table.putItem(item, {
          condition: {
            attr: 'pkey',
            condition: { type: 'exists', value: false },
          },
        }),
      );

      // Expect conditional check failure
      await expect(putPromise).rejects.toThrow();
    });

    it('should use condition for updateItem', async () => {
      const item = createItem('002', { version: 1 });
      await Effect.runPromise(table.putItem(item));

      // Update with correct version condition should succeed
      const result = await Effect.runPromise(
        table.updateItem(createKey(item.pkey), {
          UpdateExpression: 'SET #status = :status, #version = :newVersion',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#version': 'version',
          },
          ExpressionAttributeValues: {
            ':status': { S: 'updated' },
            ':newVersion': { N: '2' },
          },
          ReturnValues: 'ALL_NEW',
          condition: {
            attr: 'version',
            condition: { type: '=', value: 1 },
          },
        }),
      );

      expect(result.Attributes?.status).toBe('updated');
      expect(result.Attributes?.version).toBe(2);

      // Update with wrong version condition should fail
      const updatePromise = Effect.runPromise(
        table.updateItem(createKey(item.pkey), {
          UpdateExpression: 'SET #status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': { S: 'failed' } },
          condition: {
            attr: 'version',
            condition: { type: '=', value: 1 }, // Wrong version
          },
        }),
      );

      await expect(updatePromise).rejects.toThrow();
    });

    it('should use condition for deleteItem', async () => {
      const item = createItem('003', { deletable: true });
      await Effect.runPromise(table.putItem(item));

      // Delete with correct condition should succeed
      await Effect.runPromise(
        table.deleteItem(createKey(item.pkey), {
          condition: {
            attr: 'deletable',
            condition: { type: '=', value: true },
          },
        }),
      );

      // Verify item was deleted
      const result = await Effect.runPromise(
        table.getItem(createKey(item.pkey)),
      );
      expect(result.Item).toBeNull();

      // Put item back for failed delete test
      const nonDeletableItem = createItem('004', { deletable: false });
      await Effect.runPromise(table.putItem(nonDeletableItem));

      // Delete with wrong condition should fail
      const deletePromise = Effect.runPromise(
        table.deleteItem(createKey(nonDeletableItem.pkey), {
          condition: {
            attr: 'deletable',
            condition: { type: '=', value: true }, // Wrong value
          },
        }),
      );

      await expect(deletePromise).rejects.toThrow();
    });
  });

  describe('filterExpression for Query Operations', () => {
    it('should use filter for table query', async () => {
      const pk = 'user#005';
      const items = [
        createItem('005a', {
          pkey: pk,
          skey: 'item#001',
          score: 150,
          status: 'active',
        }),
        createItem('005b', {
          pkey: pk,
          skey: 'item#002',
          score: 50,
          status: 'active',
        }),
        createItem('005c', {
          pkey: pk,
          skey: 'item#003',
          score: 200,
          status: 'inactive',
        }),
      ];

      for (const item of items) {
        await Effect.runPromise(table.putItem(item));
      }

      const result = await Effect.runPromise(
        table.query(
          { pk },
          {
            filter: {
              type: 'and',
              value: [
                { attr: 'score', condition: { type: '>', value: 100 } },
                { attr: 'status', condition: { type: '=', value: 'active' } },
              ],
            },
          },
        ),
      );

      expect(result.Items).toHaveLength(1);
      expect(result.Items[0]).toMatchObject({ score: 150, status: 'active' });
    });

    it('should use filter for table scan', async () => {
      const items = [
        createItem('scan001', { score: 150, level: 5 }),
        createItem('scan002', { score: 50, level: 2 }),
        createItem('scan003', { score: 200, level: 8 }),
      ];

      for (const item of items) {
        await Effect.runPromise(table.putItem(item));
      }

      const result = await Effect.runPromise(
        table.scan({
          filter: {
            type: 'or',
            value: [
              { attr: 'score', condition: { type: '>', value: 180 } },
              { attr: 'level', condition: { type: '>=', value: 5 } },
            ],
          },
        }),
      );

      expect(result.Items.length).toBeGreaterThanOrEqual(2);
      result.Items.forEach((item) => {
        const hasHighScore = (item.score as number) > 180;
        const hasHighLevel = (item.level as number) >= 5;
        expect(hasHighScore || hasHighLevel).toBe(true);
      });
    });
  });

  describe('complex Filter Expressions', () => {
    it('should handle nested AND/OR conditions', async () => {
      const items = [
        createItem('complex001', { category: 'A', priority: 1, active: true }),
        createItem('complex002', { category: 'A', priority: 2, active: false }),
        createItem('complex003', { category: 'B', priority: 1, active: true }),
        createItem('complex004', { category: 'B', priority: 2, active: true }),
      ];

      for (const item of items) {
        await Effect.runPromise(table.putItem(item));
      }

      // (category = 'A' AND priority = 1) OR (category = 'B' AND active = true)
      const result = await Effect.runPromise(
        table.scan({
          filter: {
            type: 'or',
            value: [
              {
                type: 'and',
                value: [
                  { attr: 'category', condition: { type: '=', value: 'A' } },
                  { attr: 'priority', condition: { type: '=', value: 1 } },
                ],
              },
              {
                type: 'and',
                value: [
                  { attr: 'category', condition: { type: '=', value: 'B' } },
                  { attr: 'active', condition: { type: '=', value: true } },
                ],
              },
            ],
          },
        }),
      );

      expect(result.Items.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle string functions in filters', async () => {
      const items = [
        createItem('string001', { description: 'This is a test item' }),
        createItem('string002', { description: 'Another product here' }),
        createItem('string003', { description: 'Test product for testing' }),
      ];

      for (const item of items) {
        await Effect.runPromise(table.putItem(item));
      }

      const result = await Effect.runPromise(
        table.scan({
          filter: {
            attr: 'description',
            condition: { type: 'contains', value: 'test' },
          },
        }),
      );

      expect(result.Items.length).toBeGreaterThanOrEqual(2);
      result.Items.forEach((item) => {
        expect((item.description as string).toLowerCase()).toContain('test');
      });
    });
  });
});
