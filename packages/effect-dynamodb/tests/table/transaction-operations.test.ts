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

describe('transaction Operations', () => {
  describe('transactWriteItems', () => {
    describe('put Operations', () => {
      it('should put multiple items atomically', async () => {
        const users = [
          createUser('txn001', { email: 'user1@test.com' }),
          createUser('txn002', { email: 'user2@test.com' }),
          createUser('txn003', { email: 'user3@test.com' }),
        ];

        const result = await Effect.runPromise(
          table.transactWriteItems([
            { put: { item: users[0] } },
            { put: { item: users[1] } },
            { put: { item: users[2] } },
          ])
        );

        // ConsumedCapacity is only defined when explicitly requested
        expect(result.ConsumedCapacity).toBeUndefined();

        // Verify all items were created
        for (const user of users) {
          const getResult = await Effect.runPromise(
            table.getItem(createKey(user.pkey, user.skey))
          );
          expect(getResult.Item).toEqual(user);
        }
      });

      it('should put with condition expression', async () => {
        const user = createUser('txn004', { status: STATUS.ACTIVE });

        // First transaction should succeed (item doesn't exist)
        await Effect.runPromise(
          table.transactWriteItems([
            {
              put: {
                item: user,
                conditionExpression: 'attribute_not_exists(pkey)',
              },
            },
          ])
        );

        // Verify item was created
        const getResult = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey))
        );
        expect(getResult.Item).toEqual(user);

        // Second transaction should fail (item already exists)
        await expect(
          Effect.runPromise(
            table.transactWriteItems([
              {
                put: {
                  item: { ...user, status: STATUS.INACTIVE },
                  conditionExpression: 'attribute_not_exists(pkey)',
                },
              },
            ])
          )
        ).rejects.toThrow();
      });
    });

    describe('update Operations', () => {
      it('should update multiple items atomically', async () => {
        const users = [
          createUser('update001'),
          createUser('update002'),
          createUser('update003'),
        ];

        // Create items first
        for (const user of users) {
          await Effect.runPromise(table.putItem(user));
        }

        // Update all items in transaction
        await Effect.runPromise(
          table.transactWriteItems([
            {
              update: {
                key: createKey(users[0].pkey, users[0].skey),
                updateExpression: 'SET #status = :status',
                expressionAttributeNames: { '#status': 'status' },
                expressionAttributeValues: { ':status': STATUS.INACTIVE },
              },
            },
            {
              update: {
                key: createKey(users[1].pkey, users[1].skey),
                updateExpression: 'SET #status = :status',
                expressionAttributeNames: { '#status': 'status' },
                expressionAttributeValues: { ':status': STATUS.INACTIVE },
              },
            },
            {
              update: {
                key: createKey(users[2].pkey, users[2].skey),
                updateExpression: 'SET #status = :status',
                expressionAttributeNames: { '#status': 'status' },
                expressionAttributeValues: { ':status': STATUS.INACTIVE },
              },
            },
          ])
        );

        // Verify all items were updated
        for (const user of users) {
          const getResult = await Effect.runPromise(
            table.getItem(createKey(user.pkey, user.skey))
          );
          expect(getResult.Item?.status).toBe(STATUS.INACTIVE);
        }
      });

      it('should update with condition expression', async () => {
        const user = createUser('cond001', { status: STATUS.ACTIVE, version: 1 });
        await Effect.runPromise(table.putItem(user));

        // Update should succeed with correct version
        await Effect.runPromise(
          table.transactWriteItems([
            {
              update: {
                key: createKey(user.pkey, user.skey),
                updateExpression: 'SET #version = #version + :inc, #status = :status',
                conditionExpression: '#version = :currentVersion',
                expressionAttributeNames: { '#version': 'version', '#status': 'status' },
                expressionAttributeValues: { 
                  ':inc': 1, 
                  ':currentVersion': 1,
                  ':status': STATUS.INACTIVE 
                },
              },
            },
          ])
        );

        // Verify update
        const getResult = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey))
        );
        expect(getResult.Item).toMatchObject({
          version: 2,
          status: STATUS.INACTIVE,
        });

        // Update should fail with wrong version
        await expect(
          Effect.runPromise(
            table.transactWriteItems([
              {
                update: {
                  key: createKey(user.pkey, user.skey),
                  updateExpression: 'SET #version = #version + :inc',
                  conditionExpression: '#version = :wrongVersion',
                  expressionAttributeNames: { '#version': 'version' },
                  expressionAttributeValues: { ':inc': 1, ':wrongVersion': 1 },
                },
              },
            ])
          )
        ).rejects.toThrow();
      });
    });

    describe('delete Operations', () => {
      it('should delete multiple items atomically', async () => {
        const users = [
          createUser('delete001'),
          createUser('delete002'),
          createUser('delete003'),
        ];

        // Create items first
        for (const user of users) {
          await Effect.runPromise(table.putItem(user));
        }

        // Delete all items in transaction
        await Effect.runPromise(
          table.transactWriteItems([
            { delete: { key: createKey(users[0].pkey, users[0].skey) } },
            { delete: { key: createKey(users[1].pkey, users[1].skey) } },
            { delete: { key: createKey(users[2].pkey, users[2].skey) } },
          ])
        );

        // Verify all items were deleted
        for (const user of users) {
          const getResult = await Effect.runPromise(
            table.getItem(createKey(user.pkey, user.skey))
          );
          expect(getResult.Item).toBeNull();
        }
      });

      it('should delete with condition expression', async () => {
        const user = createUser('condDelete001', { status: STATUS.INACTIVE });
        await Effect.runPromise(table.putItem(user));

        // Delete should succeed with correct condition
        await Effect.runPromise(
          table.transactWriteItems([
            {
              delete: {
                key: createKey(user.pkey, user.skey),
                conditionExpression: '#status = :status',
                expressionAttributeNames: { '#status': 'status' },
                expressionAttributeValues: { ':status': STATUS.INACTIVE },
              },
            },
          ])
        );

        // Verify item was deleted
        const getResult = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey))
        );
        expect(getResult.Item).toBeNull();
      });
    });

    describe('conditionCheck Operations', () => {
      it('should perform condition checks without modifying data', async () => {
        const user = createUser('check001', { status: STATUS.ACTIVE });
        await Effect.runPromise(table.putItem(user));

        const newUser = createUser('check002', { status: STATUS.ACTIVE });

        // Transaction with condition check should succeed
        await Effect.runPromise(
          table.transactWriteItems([
            {
              conditionCheck: {
                key: createKey(user.pkey, user.skey),
                conditionExpression: '#status = :status',
                expressionAttributeNames: { '#status': 'status' },
                expressionAttributeValues: { ':status': STATUS.ACTIVE },
              },
            },
            { put: { item: newUser } },
          ])
        );

        // Verify new item was created
        const getResult = await Effect.runPromise(
          table.getItem(createKey(newUser.pkey, newUser.skey))
        );
        expect(getResult.Item).toEqual(newUser);

        // Transaction with failing condition check should fail
        const anotherUser = createUser('check003');
        await expect(
          Effect.runPromise(
            table.transactWriteItems([
              {
                conditionCheck: {
                  key: createKey(user.pkey, user.skey),
                  conditionExpression: '#status = :status',
                  expressionAttributeNames: { '#status': 'status' },
                  expressionAttributeValues: { ':status': STATUS.INACTIVE },
                },
              },
              { put: { item: anotherUser } },
            ])
          )
        ).rejects.toThrow();

        // Verify the other item was not created
        const failedResult = await Effect.runPromise(
          table.getItem(createKey(anotherUser.pkey, anotherUser.skey))
        );
        expect(failedResult.Item).toBeNull();
      });
    });

    describe('mixed Operations', () => {
      it('should handle mixed put, update, delete, and condition check operations', async () => {
        const existingUser = createUser('mixed001', { status: STATUS.ACTIVE });
        const checkUser = createUser('mixed002', { status: STATUS.ACTIVE });
        const deleteUser = createUser('mixed004', { status: STATUS.PENDING });
        
        // Create existing items
        await Effect.runPromise(table.putItem(existingUser));
        await Effect.runPromise(table.putItem(checkUser));
        await Effect.runPromise(table.putItem(deleteUser));

        const newUser = createUser('mixed003', { status: STATUS.PENDING });

        // Complex transaction with all operation types (each on different items)
        await Effect.runPromise(
          table.transactWriteItems([
            // Condition check - ensure checkUser is active
            {
              conditionCheck: {
                key: createKey(checkUser.pkey, checkUser.skey),
                conditionExpression: '#status = :activeStatus',
                expressionAttributeNames: { '#status': 'status' },
                expressionAttributeValues: { ':activeStatus': STATUS.ACTIVE },
              },
            },
            // Put new user
            { put: { item: newUser } },
            // Update existing user
            {
              update: {
                key: createKey(existingUser.pkey, existingUser.skey),
                updateExpression: 'SET #status = :newStatus, #updated = :timestamp',
                expressionAttributeNames: { '#status': 'status', '#updated': 'updatedAt' },
                expressionAttributeValues: { 
                  ':newStatus': STATUS.INACTIVE, 
                  ':timestamp': '2024-01-01T00:00:00Z' 
                },
              },
            },
            // Delete a different user
            { delete: { key: createKey(deleteUser.pkey, deleteUser.skey) } },
          ])
        );

        // Verify all operations were applied
        const newUserResult = await Effect.runPromise(
          table.getItem(createKey(newUser.pkey, newUser.skey))
        );
        expect(newUserResult.Item).toEqual(newUser);

        const updatedUserResult = await Effect.runPromise(
          table.getItem(createKey(existingUser.pkey, existingUser.skey))
        );
        expect(updatedUserResult.Item).toMatchObject({
          status: STATUS.INACTIVE,
          updatedAt: '2024-01-01T00:00:00Z',
        });

        // Verify check user still exists (only condition check, no modification)
        const checkUserResult = await Effect.runPromise(
          table.getItem(createKey(checkUser.pkey, checkUser.skey))
        );
        expect(checkUserResult.Item).toMatchObject({ status: STATUS.ACTIVE });

        // Verify delete user was deleted
        const deletedUserResult = await Effect.runPromise(
          table.getItem(createKey(deleteUser.pkey, deleteUser.skey))
        );
        expect(deletedUserResult.Item).toBeNull();
      });
    });

    describe('error handling', () => {
      it('should fail when exceeding 25 operations', async () => {
        const items = Array.from({ length: 26 }, (_, i) =>
          ({ put: { item: createUser(`bulk${i.toString().padStart(3, '0')}`) } })
        );

        await expect(
          Effect.runPromise(table.transactWriteItems(items))
        ).rejects.toThrow('transactWriteItems supports maximum 25 operations per request');
      });

      it('should fail when no operations provided', async () => {
        await expect(
          Effect.runPromise(table.transactWriteItems([]))
        ).rejects.toThrow('transactWriteItems requires at least one operation');
      });

      it('should include consumed capacity when requested', async () => {
        const user = createUser('capacity001');
        
        const result = await Effect.runPromise(
          table.transactWriteItems(
            [{ put: { item: user } }],
            { ReturnConsumedCapacity: 'TOTAL' }
          )
        );

        expect(result.ConsumedCapacity).toBeDefined();
      });
    });
  });

  describe('transactGetItems', () => {
    it('should get multiple items atomically with consistent reads', async () => {
      const users = [
        createUser('get001', { email: 'user1@test.com' }),
        createUser('get002', { email: 'user2@test.com' }),
        createUser('get003', { email: 'user3@test.com' }),
      ];

      // Create items first
      for (const user of users) {
        await Effect.runPromise(table.putItem(user));
      }

      const result = await Effect.runPromise(
        table.transactGetItems([
          { key: createKey(users[0].pkey, users[0].skey) },
          { key: createKey(users[1].pkey, users[1].skey) },
          { key: createKey(users[2].pkey, users[2].skey) },
        ])
      );

      expectItemCount(result.Items.filter(item => item !== null), 3);
      expect(result.Items[0]).toEqual(users[0]);
      expect(result.Items[1]).toEqual(users[1]);
      expect(result.Items[2]).toEqual(users[2]);
    });

    it('should handle non-existent items in transaction get', async () => {
      const existingUser = createUser('existing001');
      await Effect.runPromise(table.putItem(existingUser));

      const result = await Effect.runPromise(
        table.transactGetItems([
          { key: createKey(existingUser.pkey, existingUser.skey) },
          { key: createKey('non-existent', 'profile') },
        ])
      );

      expect(result.Items).toHaveLength(2);
      expect(result.Items[0]).toEqual(existingUser);
      expect(result.Items[1]).toBeNull();
    });

    it('should work with projection expressions', async () => {
      const user = createUser('proj001', { 
        email: 'user@test.com', 
        name: 'Test User',
        phone: '555-1234',
        address: '123 Test St'
      });
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.transactGetItems([
          {
            key: createKey(user.pkey, user.skey),
            projectionExpression: 'pkey, skey, #name, #email',
            expressionAttributeNames: { '#name': 'name', '#email': 'email' },
          },
        ])
      );

      expect(result.Items).toHaveLength(1);
      const item = result.Items[0];
      expect(Object.keys(item!).sort()).toEqual(['email', 'name', 'pkey', 'skey']);
      expect(item!.name).toBe('Test User');
      expect(item!.email).toBe('user@test.com');
      expect((item as any).phone).toBeUndefined();
      expect((item as any).address).toBeUndefined();
    });

    it('should include consumed capacity when requested', async () => {
      const user = createUser('capacity002');
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.transactGetItems(
          [{ key: createKey(user.pkey, user.skey) }],
          { ReturnConsumedCapacity: 'TOTAL' }
        )
      );

      expect(result.ConsumedCapacity).toBeDefined();
      expect(result.Items[0]).toEqual(user);
    });

    describe('error handling', () => {
      it('should fail when exceeding 25 operations', async () => {
        const keys = Array.from({ length: 26 }, (_, i) =>
          ({ key: createKey(`user-${i}`, 'profile') })
        );

        await expect(
          Effect.runPromise(table.transactGetItems(keys))
        ).rejects.toThrow('transactGetItems supports maximum 25 operations per request');
      });

      it('should fail when no operations provided', async () => {
        await expect(
          Effect.runPromise(table.transactGetItems([]))
        ).rejects.toThrow('transactGetItems requires at least one operation');
      });
    });
  });

  describe('atomicity and consistency', () => {
    it('should rollback all operations if any operation fails', async () => {
      const user1 = createUser('atomic001');
      const user2 = createUser('atomic002', { status: STATUS.ACTIVE });
      
      // Create user2 first
      await Effect.runPromise(table.putItem(user2));

      // This transaction should fail because we're trying to put user2 again with condition
      await expect(
        Effect.runPromise(
          table.transactWriteItems([
            { put: { item: user1 } }, // This would succeed
            { 
              put: { 
                item: { ...user2, status: STATUS.INACTIVE },
                conditionExpression: 'attribute_not_exists(pkey)' // This will fail
              } 
            },
          ])
        )
      ).rejects.toThrow();

      // Verify user1 was NOT created (rollback)
      const user1Result = await Effect.runPromise(
        table.getItem(createKey(user1.pkey, user1.skey))
      );
      expect(user1Result.Item).toBeNull();

      // Verify user2 was NOT modified (rollback)
      const user2Result = await Effect.runPromise(
        table.getItem(createKey(user2.pkey, user2.skey))
      );
      expect(user2Result.Item?.status).toBe(STATUS.ACTIVE);
    });

    it('should provide strong consistency for transact get operations', async () => {
      const users = [
        createUser('consistency001'),
        createUser('consistency002'),
      ];

      // Create items
      for (const user of users) {
        await Effect.runPromise(table.putItem(user));
      }

      // Immediately read with transaction (should see writes due to strong consistency)
      const result = await Effect.runPromise(
        table.transactGetItems([
          { key: createKey(users[0].pkey, users[0].skey) },
          { key: createKey(users[1].pkey, users[1].skey) },
        ])
      );

      expect(result.Items[0]).toEqual(users[0]);
      expect(result.Items[1]).toEqual(users[1]);
    });
  });
});