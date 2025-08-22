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
    ...overrides,
  };
}

const createKey = (pkey: string, skey: string = 'profile') => ({ pkey, skey });

beforeEach(async () => {
  await cleanTable();
});

describe('cRUD Operations', () => {
  describe('core Operations', () => {
    it('should put and get item', async () => {
      const item = createItem('001');
      await Effect.runPromise(table.putItem(item));

      const result = await Effect.runPromise(
        table.getItem(createKey(item.pkey)),
      );
      expect(result.Item).toEqual(item);
    });

    it('should return null for non-existent item', async () => {
      const result = await Effect.runPromise(
        table.getItem(createKey('user#999')),
      );
      expect(result.Item).toBeNull();
    });

    it('should update item', async () => {
      const item = createItem('002');
      await Effect.runPromise(table.putItem(item));

      const result = await Effect.runPromise(
        table.updateItem(createKey(item.pkey), {
          update: {
            SET: {
              status: { op: 'assign', value: 'inactive' },
            },
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      expect(result.Attributes?.status).toBe('inactive');
    });

    it('should update non-existent item (upsert)', async () => {
      const result = await Effect.runPromise(
        table.updateItem(createKey('user#999'), {
          update: {
            SET: { status: { op: 'assign', value: 'created' } },
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      expect(result.Attributes?.status).toBe('created');
    });

    it('should delete item', async () => {
      const item = createItem('003');
      await Effect.runPromise(table.putItem(item));

      await Effect.runPromise(table.deleteItem(createKey(item.pkey)));
      const result = await Effect.runPromise(
        table.getItem(createKey(item.pkey)),
      );
      expect(result.Item).toBeNull();
    });

    it('should delete non-existent item gracefully', async () => {
      await Effect.runPromise(table.deleteItem(createKey('user#999')));
      // Should not throw
    });
  });

  describe('enhanced Operations', () => {
    it('should use return values and monitoring options', async () => {
      const item = createItem('004');

      // Test putItem with return values
      const putResult = await Effect.runPromise(
        table.putItem(item, {
          ReturnConsumedCapacity: 'TOTAL',
          ReturnValues: 'ALL_OLD',
        }),
      );
      expect(putResult.ConsumedCapacity).toBeDefined();

      // Test updateItem with monitoring
      const updateResult = await Effect.runPromise(
        table.updateItem(createKey(item.pkey), {
          update: {
            SET: {
              status: { op: 'assign', value: 'updated' },
            },
          },
          ReturnValues: 'ALL_NEW',
          ReturnConsumedCapacity: 'TOTAL',
        }),
      );
      expect(updateResult.ConsumedCapacity).toBeDefined();
      expect(updateResult.Attributes?.status).toBe('updated');
    });

    it('should handle complex update expressions', async () => {
      const item = createItem('005', { count: 10, tags: ['tag1'] });
      await Effect.runPromise(table.putItem(item));

      const result = await Effect.runPromise(
        table.updateItem(createKey(item.pkey), {
          update: {
            SET: {
              count: { op: 'plus', attr: 'count', value: 5 },
              tags: { op: 'list_append', attr: 'tags', list: ['tag2'] },
            },
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      expect(result.Attributes?.count).toBe(15);
      expect(result.Attributes?.tags).toEqual(['tag1', 'tag2']);
    });
  });
});
