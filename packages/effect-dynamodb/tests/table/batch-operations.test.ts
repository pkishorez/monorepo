import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable } from '../setup.js';
import {
  createKey,
  createSimpleTable,
  createUser,
  expectItemCount,
  STATUS,
} from './utils.js';

const table = createSimpleTable();

beforeEach(async () => {
  await cleanTable();
});

describe('batch Operations', () => {
  describe('batchGetItem', () => {
    it('should retrieve multiple items at once', async () => {
      const users = [
        createUser('001'),
        createUser('002'), 
        createUser('003'),
      ];

      // Put items first
      for (const user of users) {
        await Effect.runPromise(table.putItem(user));
      }

      const keys = users.map(user => createKey(user.pkey, user.skey));
      const result = await Effect.runPromise(table.batchGetItem(keys));

      expectItemCount(result.Items, 3);
      expect(result.Items.map(item => item.pkey).sort()).toEqual(
        users.map(user => user.pkey).sort()
      );
    });

    it('should handle non-existent keys gracefully', async () => {
      const existingUser = createUser('existing');
      await Effect.runPromise(table.putItem(existingUser));

      const keys = [
        createKey(existingUser.pkey, existingUser.skey),
        createKey('non-existent-1', 'profile'),
        createKey('non-existent-2', 'profile'),
      ];

      const result = await Effect.runPromise(table.batchGetItem(keys));

      expectItemCount(result.Items, 1);
      expect(result.Items[0].pkey).toBe(existingUser.pkey);
    });

    it('should work with consistent read option', async () => {
      const users = [createUser('consistent001'), createUser('consistent002')];

      for (const user of users) {
        await Effect.runPromise(table.putItem(user));
      }

      const keys = users.map(user => createKey(user.pkey, user.skey));
      const result = await Effect.runPromise(
        table.batchGetItem(keys, { consistentRead: true })
      );

      expectItemCount(result.Items, 2);
    });

    it('should work with projection expression', async () => {
      const users = [
        createUser('proj001', { email: 'user1@test.com', status: STATUS.ACTIVE }),
        createUser('proj002', { email: 'user2@test.com', status: STATUS.INACTIVE }),
      ];

      for (const user of users) {
        await Effect.runPromise(table.putItem(user));
      }

      const keys = users.map(user => createKey(user.pkey, user.skey));
      const result = await Effect.runPromise(
        table.batchGetItem(keys, {
          projectionExpression: 'pkey, skey, #status',
          expressionAttributeNames: { '#status': 'status' },
        })
      );

      expectItemCount(result.Items, 2);
      result.Items.forEach(item => {
        expect(Object.keys(item).sort()).toEqual(['pkey', 'skey', 'status']);
        expect(item.email).toBeUndefined();
      });
    });

    it('should include consumed capacity when requested', async () => {
      const user = createUser('capacity001');
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.batchGetItem([createKey(user.pkey, user.skey)], {
          returnConsumedCapacity: 'TOTAL',
        })
      );

      expect(result.ConsumedCapacity).toBeDefined();
    });

    it('should fail when requesting more than 100 items', async () => {
      const keys = Array.from({ length: 101 }, (_, i) => 
        createKey(`user-${i}`, 'profile')
      );

      await expect(
        Effect.runPromise(table.batchGetItem(keys))
      ).rejects.toThrow('batchGetItem supports maximum 100 keys per request');
    });
  });

  describe('batchWriteItem', () => {
    it('should put multiple items at once', async () => {
      const users = [
        createUser('batch001'),
        createUser('batch002'),
        createUser('batch003'),
      ];

      const result = await Effect.runPromise(
        table.batchWriteItem({ putRequests: users })
      );

      expect(result.UnprocessedItems).toBeUndefined();

      // Verify items were created
      for (const user of users) {
        const getResult = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey))
        );
        expect(getResult.Item).toEqual(user);
      }
    });

    it('should delete multiple items at once', async () => {
      const users = [
        createUser('delete001'),
        createUser('delete002'),
        createUser('delete003'),
      ];

      // Put items first
      for (const user of users) {
        await Effect.runPromise(table.putItem(user));
      }

      const deleteKeys = users.map(user => createKey(user.pkey, user.skey));
      await Effect.runPromise(
        table.batchWriteItem({ deleteRequests: deleteKeys })
      );

      // Verify items were deleted
      for (const user of users) {
        const getResult = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey))
        );
        expect(getResult.Item).toBeNull();
      }
    });

    it('should handle mixed put and delete operations', async () => {
      const existingUser = createUser('existing');
      await Effect.runPromise(table.putItem(existingUser));

      const newUsers = [createUser('new001'), createUser('new002')];
      const deleteKeys = [createKey(existingUser.pkey, existingUser.skey)];

      await Effect.runPromise(
        table.batchWriteItem({
          putRequests: newUsers,
          deleteRequests: deleteKeys,
        })
      );

      // Check new items were created
      for (const user of newUsers) {
        const getResult = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey))
        );
        expect(getResult.Item).toEqual(user);
      }

      // Check existing item was deleted
      const deletedResult = await Effect.runPromise(
        table.getItem(createKey(existingUser.pkey, existingUser.skey))
      );
      expect(deletedResult.Item).toBeNull();
    });

    it('should include consumed capacity when requested', async () => {
      const users = [createUser('capacity001')];
      
      const result = await Effect.runPromise(
        table.batchWriteItem(
          { putRequests: users },
          { returnConsumedCapacity: 'TOTAL' }
        )
      );

      expect(result.ConsumedCapacity).toBeDefined();
    });

    it('should fail when requesting more than 25 operations', async () => {
      const users = Array.from({ length: 26 }, (_, i) => 
        createUser(`bulk-${i.toString().padStart(3, '0')}`)
      );

      await expect(
        Effect.runPromise(table.batchWriteItem({ putRequests: users }))
      ).rejects.toThrow('batchWriteItem supports maximum 25 operations per request');
    });

    it('should fail when put + delete operations exceed 25', async () => {
      const putUsers = Array.from({ length: 15 }, (_, i) => 
        createUser(`put-${i.toString().padStart(3, '0')}`)
      );
      
      const deleteKeys = Array.from({ length: 11 }, (_, i) => 
        createKey(`delete-${i.toString().padStart(3, '0')}`, 'profile')
      );

      await expect(
        Effect.runPromise(
          table.batchWriteItem({
            putRequests: putUsers,
            deleteRequests: deleteKeys,
          })
        )
      ).rejects.toThrow('batchWriteItem supports maximum 25 operations per request');
    });
  });

  describe('batch operation edge cases', () => {
    it('should reject empty batch requests', async () => {
      await expect(
        Effect.runPromise(
          table.batchWriteItem({ putRequests: [], deleteRequests: [] })
        )
      ).rejects.toThrow('batchWriteItem requires at least one put or delete request');
    });

    it('should handle batch requests with only puts', async () => {
      const users = [createUser('only-put-001')];
      
      const result = await Effect.runPromise(
        table.batchWriteItem({ putRequests: users })
      );

      expect(result.UnprocessedItems).toBeUndefined();
    });

    it('should handle batch requests with only deletes', async () => {
      const user = createUser('only-delete-001');
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.batchWriteItem({ 
          deleteRequests: [createKey(user.pkey, user.skey)]
        })
      );

      expect(result.UnprocessedItems).toBeUndefined();
    });
  });
});