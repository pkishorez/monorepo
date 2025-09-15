import type { DynamoTable } from '../src/table/index.js';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from './setup.js';

interface TestItem {
  name: string;
  email: string;
  status: 'active' | 'inactive';
  age?: number;
  tags?: string[];
}

// Create a typed table for testing
const typedTable = table as DynamoTable<
  { pk: 'pkey'; sk: 'skey' },
  {
    GSI1: { pk: 'gsi1pk'; sk: 'gsi1sk' };
    GSI2: { pk: 'gsi2pk'; sk: 'gsi2sk' };
    LSI1: { pk: 'pkey'; sk: 'lsi1skey' };
  },
  TestItem
>;

describe('cRUD Operations', () => {
  beforeEach(async () => {
    await cleanTable();
  });

  describe('putItem', () => {
    it('should insert an item', async () => {
      const item: TestItem = {
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
        age: 30,
      };

      const result = await Effect.runPromise(
        typedTable.putItem({ pkey: 'user#1', skey: 'profile' }, item),
      );

      expect(result).toBeDefined();

      // Verify item was inserted
      const getResult = await Effect.runPromise(
        typedTable.getItem({ pkey: 'user#1', skey: 'profile' }),
      );

      expect(getResult.Item).toMatchObject(item);
    });

    it('should handle GSI keys', async () => {
      const item = {
        name: 'Jane Smith',
        email: 'jane@example.com',
        status: 'active' as const,
        gsi1pk: 'email#jane@example.com',
        gsi1sk: 'user#2',
      };

      await Effect.runPromise(
        typedTable.putItem({ pkey: 'user#2', skey: 'profile' }, item),
      );

      const result = await Effect.runPromise(
        typedTable.getItem({ pkey: 'user#2', skey: 'profile' }),
      );

      expect(result.Item).toMatchObject({
        name: 'Jane Smith',
        email: 'jane@example.com',
        gsi1pk: 'email#jane@example.com',
      });
    });
  });

  describe('getItem', () => {
    it('should retrieve an existing item', async () => {
      const item: TestItem = {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        status: 'active',
      };

      await Effect.runPromise(
        typedTable.putItem({ pkey: 'user#3', skey: 'profile' }, item),
      );

      const result = await Effect.runPromise(
        typedTable.getItem({ pkey: 'user#3', skey: 'profile' }),
      );

      expect(result.Item).toMatchObject(item);
      expect(result.Item?.pkey).toBe('user#3');
      expect(result.Item?.skey).toBe('profile');
    });

    it('should return null for non-existent item', async () => {
      const result = await Effect.runPromise(
        typedTable.getItem({ pkey: 'nonexistent', skey: 'item' }),
      );

      expect(result.Item).toBeNull();
    });

    it('should support projection expressions', async () => {
      const item: TestItem = {
        name: 'Alice Cooper',
        email: 'alice@example.com',
        status: 'active',
        age: 25,
        tags: ['developer', 'designer'],
      };

      await Effect.runPromise(
        typedTable.putItem({ pkey: 'user#4', skey: 'profile' }, item),
      );

      const result = await Effect.runPromise(
        typedTable.getItem(
          { pkey: 'user#4', skey: 'profile' },
          { projection: ['name', 'email'] },
        ),
      );

      expect(result.Item).toEqual({
        name: 'Alice Cooper',
        email: 'alice@example.com',
      });
    });
  });

  describe('updateItem', () => {
    it('should update existing item attributes', async () => {
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'user#5', skey: 'profile' },
          {
            name: 'Update Test',
            email: 'update@example.com',
            status: 'active' as const,
            age: 20,
          },
        ),
      );

      await Effect.runPromise(
        typedTable.updateItem(
          { pkey: 'user#5', skey: 'profile' },
          {
            update: {
              age: 21,
              status: 'inactive' as const,
            },
          },
        ),
      );

      const result = await Effect.runPromise(
        typedTable.getItem({ pkey: 'user#5', skey: 'profile' }),
      );

      expect(result.Item?.age).toBe(21);
      expect(result.Item?.status).toBe('inactive');
      expect(result.Item?.name).toBe('Update Test');
    });
  });

  describe('deleteItem', () => {
    it('should delete an existing item', async () => {
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'user#7', skey: 'profile' },
          {
            name: 'Delete Test',
            email: 'delete@example.com',
            status: 'active' as const,
          },
        ),
      );

      const deleteResult = await Effect.runPromise(
        typedTable.deleteItem({ pkey: 'user#7', skey: 'profile' }),
      );

      expect(deleteResult).toBeDefined();

      const getResult = await Effect.runPromise(
        typedTable.getItem({ pkey: 'user#7', skey: 'profile' }),
      );

      expect(getResult.Item).toBeNull();
    });

    it('should return old values when requested', async () => {
      const item = {
        name: 'Return Test',
        email: 'return@example.com',
        status: 'active' as const,
      };

      await Effect.runPromise(
        typedTable.putItem({ pkey: 'user#8', skey: 'profile' }, item),
      );

      const deleteResult = await Effect.runPromise(
        typedTable.deleteItem(
          { pkey: 'user#8', skey: 'profile' },
          { ReturnValues: 'ALL_OLD' },
        ),
      );

      expect(deleteResult.Attributes).toMatchObject(item);
    });
  });

  describe('batchGetItems', () => {
    it('should retrieve multiple items', async () => {
      // Insert test items
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'batch#1', skey: 'item' },
          {
            name: 'Item 1',
            email: 'item1@example.com',
            status: 'active' as const,
          },
        ),
      );

      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'batch#2', skey: 'item' },
          {
            name: 'Item 2',
            email: 'item2@example.com',
            status: 'active' as const,
          },
        ),
      );

      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'batch#3', skey: 'item' },
          {
            name: 'Item 3',
            email: 'item3@example.com',
            status: 'inactive' as const,
          },
        ),
      );

      const result = await Effect.runPromise(
        typedTable.batchGetItems([
          { pkey: 'batch#1', skey: 'item' },
          { pkey: 'batch#2', skey: 'item' },
          { pkey: 'batch#3', skey: 'item' },
        ]),
      );

      expect(result.items).toHaveLength(3);
      expect(result.items.map((item) => item.name).sort()).toEqual([
        'Item 1',
        'Item 2',
        'Item 3',
      ]);
    });

    it('should handle non-existent keys gracefully', async () => {
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'exists', skey: 'item' },
          {
            name: 'Exists',
            email: 'exists@example.com',
            status: 'active' as const,
          },
        ),
      );

      const result = await Effect.runPromise(
        typedTable.batchGetItems([
          { pkey: 'exists', skey: 'item' },
          { pkey: 'notexists', skey: 'item' },
        ]),
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Exists');
    });
  });

  describe('batchWriteItems', () => {
    it('should batch put multiple items', async () => {
      const result = await Effect.runPromise(
        typedTable.batchWriteItems(
          {
            put: [
              {
                key: { pkey: 'bw#1', skey: 'item' },
                item: {
                  name: 'BW Item 1',
                  email: 'bw1@example.com',
                  status: 'active' as const,
                },
              },
              {
                key: { pkey: 'bw#2', skey: 'item' },
                item: {
                  name: 'BW Item 2',
                  email: 'bw2@example.com',
                  status: 'active' as const,
                },
              },
            ],
          },
          {},
        ),
      );

      expect(result.unprocessed).toHaveLength(0);

      // Verify items were inserted
      const getResult1 = await Effect.runPromise(
        typedTable.getItem({ pkey: 'bw#1', skey: 'item' }),
      );
      const getResult2 = await Effect.runPromise(
        typedTable.getItem({ pkey: 'bw#2', skey: 'item' }),
      );

      expect(getResult1.Item?.name).toBe('BW Item 1');
      expect(getResult2.Item?.name).toBe('BW Item 2');
    });

    it('should batch delete multiple items', async () => {
      // Insert items first
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'del#1', skey: 'item' },
          {
            name: 'Del 1',
            email: 'del1@example.com',
            status: 'active' as const,
          },
        ),
      );
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'del#2', skey: 'item' },
          {
            name: 'Del 2',
            email: 'del2@example.com',
            status: 'active' as const,
          },
        ),
      );

      // Batch delete
      await Effect.runPromise(
        typedTable.batchWriteItems(
          {
            delete: [
              { pkey: 'del#1', skey: 'item' },
              { pkey: 'del#2', skey: 'item' },
            ],
          },
          {},
        ),
      );

      // Verify items were deleted
      const getResult1 = await Effect.runPromise(
        typedTable.getItem({ pkey: 'del#1', skey: 'item' }),
      );
      const getResult2 = await Effect.runPromise(
        typedTable.getItem({ pkey: 'del#2', skey: 'item' }),
      );

      expect(getResult1.Item).toBeNull();
      expect(getResult2.Item).toBeNull();
    });

    it('should handle mixed put and delete operations', async () => {
      // Insert an item to delete
      await Effect.runPromise(
        typedTable.putItem(
          { pkey: 'mixed#delete', skey: 'item' },
          {
            name: 'To Delete',
            email: 'delete@example.com',
            status: 'active' as const,
          },
        ),
      );

      await Effect.runPromise(
        typedTable.batchWriteItems(
          {
            put: [
              {
                key: { pkey: 'mixed#put', skey: 'item' },
                item: {
                  name: 'New Item',
                  email: 'new@example.com',
                  status: 'active' as const,
                },
              },
            ],
            delete: [{ pkey: 'mixed#delete', skey: 'item' }],
          },
          {},
        ),
      );

      // Verify operations
      const putResult = await Effect.runPromise(
        typedTable.getItem({ pkey: 'mixed#put', skey: 'item' }),
      );
      const deleteResult = await Effect.runPromise(
        typedTable.getItem({ pkey: 'mixed#delete', skey: 'item' }),
      );

      expect(putResult.Item?.name).toBe('New Item');
      expect(deleteResult.Item).toBeNull();
    });
  });
});

