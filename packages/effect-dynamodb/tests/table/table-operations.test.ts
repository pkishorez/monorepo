import type { UserItem } from './utils.js';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable } from '../setup.js';
import {
  batchPutItems,
  createKey,
  createSimpleTable,
  createUser,
  expectAllItemsMatch,
  expectItemCount,
  PREFIXES,
  SORT_KEY_TYPES,
  STATUS,
} from './utils.js';

const table = createSimpleTable();

beforeEach(async () => {
  await cleanTable();
});

describe('table Operations', () => {
  describe('cRUD Operations', () => {
    it('should put and get an item', async () => {
      const user = createUser('001');
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.getItem(createKey(user.pkey, user.skey)),
      );

      expect(result.Item).toEqual(user);
    });

    it('should return null for non-existent item', async () => {
      const result = await Effect.runPromise(
        table.getItem(createKey(`${PREFIXES.USER}999`, SORT_KEY_TYPES.PROFILE)),
      );

      expect(result.Item).toBeNull();
    });

    it('should update item with attributes', async () => {
      const user = createUser('002');
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.updateItem(createKey(user.pkey), {
          UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':status': { S: STATUS.INACTIVE },
            ':updatedAt': { S: '2024-01-01' },
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      expect(result.Attributes).toMatchObject({ status: STATUS.INACTIVE, updatedAt: '2024-01-01' });
    });

    it('should update item with expression', async () => {
      const user = createUser('003', { count: 5 });
      await Effect.runPromise(table.putItem(user));

      const result = await Effect.runPromise(
        table.updateItem(createKey(user.pkey), {
          UpdateExpression: 'SET #count = #count + :inc',
          ExpressionAttributeNames: { '#count': 'count' },
          ExpressionAttributeValues: { ':inc': { N: '3' } },
          ReturnValues: 'ALL_NEW',
        }),
      );

      expect(result.Attributes!.count).toBe(8);
    });

    it('should delete an item', async () => {
      const user = createUser('004');
      await Effect.runPromise(table.putItem(user));

      await Effect.runPromise(table.deleteItem(createKey(user.pkey)));
      const result = await Effect.runPromise(
        table.getItem(createKey(user.pkey)),
      );

      expect(result.Item).toBeNull();
    });

    describe('enhanced Return Options', () => {
      it('should get item with consumed capacity monitoring', async () => {
        const user = createUser('monitor001');
        await Effect.runPromise(table.putItem(user));

        const result = await Effect.runPromise(
          table.getItem(createKey(user.pkey, user.skey), {
            ReturnConsumedCapacity: 'TOTAL',
          }),
        );

        expect(result.Item).toEqual(user);
        expect(result.ConsumedCapacity).toBeDefined();
      });

      it('should put item with return value ALL_OLD', async () => {
        const user = createUser('return001');
        await Effect.runPromise(table.putItem(user));

        // Update the item and get old value back
        const newUser = { ...user, status: STATUS.INACTIVE };
        const result = await Effect.runPromise(
          table.putItem(newUser, { ReturnValues: 'ALL_OLD' }),
        );

        expect(result.Attributes).toEqual(user);
      });

      it('should update item with all monitoring options', async () => {
        const user = createUser('monitor002');
        await Effect.runPromise(table.putItem(user));

        const result = await Effect.runPromise(
          table.updateItem(createKey(user.pkey), {
            UpdateExpression: 'SET #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':status': { S: STATUS.INACTIVE },
            },
            ReturnValues: 'ALL_NEW',
            ReturnConsumedCapacity: 'TOTAL',
            ReturnItemCollectionMetrics: 'SIZE',
          }),
        );

        expect(result.ConsumedCapacity).toBeDefined();
        expect(result.Attributes).toMatchObject({ status: STATUS.INACTIVE });
      });
    });
  });

  describe('query Operations', () => {
    it('should query by partition key only', async () => {
      const baseUser = createUser('005');
      await Effect.runPromise(table.putItem(baseUser));
      await Effect.runPromise(
        table.putItem({ ...baseUser, skey: SORT_KEY_TYPES.SETTINGS }),
      );

      const result = await Effect.runPromise(
        table.query({ pk: baseUser.pkey }),
      );

      expectItemCount(result.Items, 2);
    });

    describe('sort Key Conditions', () => {
      it('should query with sort key exact match (string)', async () => {
        const user = createUser('006');
        await batchPutItems(table, [
          { ...user, skey: 'profile-main' },
          { ...user, skey: 'profile-backup' },
          { ...user, skey: 'settings' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: 'profile-main',
          }),
        );

        expectItemCount(result.Items, 1);
        expect(result.Items[0].skey).toBe('profile-main');
      });

      it('should query with sort key exact match (= operator)', async () => {
        const user = createUser('007');
        await batchPutItems(table, [
          { ...user, skey: 'v1' },
          { ...user, skey: 'v2' },
          { ...user, skey: 'v3' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { '=': 'v2' },
          }),
        );

        expectItemCount(result.Items, 1);
        expect(result.Items[0].skey).toBe('v2');
      });

      it('should query with beginsWith condition', async () => {
        const user = createUser('008');
        await batchPutItems(table, [
          { ...user, skey: 'profile-main' },
          { ...user, skey: 'profile-backup' },
          { ...user, skey: 'settings' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { beginsWith: 'profile' },
          }),
        );

        expectItemCount(result.Items, 2);
        expectAllItemsMatch(result.Items, (item) =>
          item.skey.startsWith('profile'),
        );
      });

      it('should query with less than (<) condition', async () => {
        const user = createUser('009');
        await batchPutItems(table, [
          { ...user, skey: 'item#001' },
          { ...user, skey: 'item#002' },
          { ...user, skey: 'item#003' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { '<': 'item#002' },
          }),
        );

        expectItemCount(result.Items, 1);
        expect(result.Items[0].skey).toBe('item#001');
      });

      it('should query with less than or equal (<=) condition', async () => {
        const user = createUser('010');
        await batchPutItems(table, [
          { ...user, skey: 'doc#001' },
          { ...user, skey: 'doc#002' },
          { ...user, skey: 'doc#003' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { '<=': 'doc#002' },
          }),
        );

        expectItemCount(result.Items, 2);
        expectAllItemsMatch(result.Items, (item) => item.skey <= 'doc#002');
      });

      it('should query with greater than (>) condition', async () => {
        const user = createUser('011');
        await batchPutItems(table, [
          { ...user, skey: 'log#001' },
          { ...user, skey: 'log#002' },
          { ...user, skey: 'log#003' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { '>': 'log#002' },
          }),
        );

        expectItemCount(result.Items, 1);
        expect(result.Items[0].skey).toBe('log#003');
      });

      it('should query with greater than or equal (>=) condition', async () => {
        const user = createUser('012');
        await batchPutItems(table, [
          { ...user, skey: 'rec#001' },
          { ...user, skey: 'rec#002' },
          { ...user, skey: 'rec#003' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { '>=': 'rec#002' },
          }),
        );

        expectItemCount(result.Items, 2);
        expectAllItemsMatch(result.Items, (item) => item.skey >= 'rec#002');
      });

      it('should query with between condition', async () => {
        const user = createUser('013');
        await batchPutItems(table, [
          { ...user, skey: '2024-01-01' },
          { ...user, skey: '2024-01-15' },
          { ...user, skey: '2024-02-01' },
          { ...user, skey: '2024-02-15' },
        ]);

        const result = await Effect.runPromise(
          table.query({
            pk: user.pkey,
            sk: { between: ['2024-01-10', '2024-02-10'] },
          }),
        );

        expectItemCount(result.Items, 2);
        expect(result.Items[0].skey).toBe('2024-01-15');
        expect(result.Items[1].skey).toBe('2024-02-01');
      });
    });

    describe('advanced Query Features', () => {
      it('should query with filter expression', async () => {
        const user = createUser('filter001');
        await batchPutItems(table, [
          { ...user, skey: 'item#001', status: STATUS.ACTIVE, score: 100 },
          { ...user, skey: 'item#002', status: STATUS.INACTIVE, score: 50 },
          { ...user, skey: 'item#003', status: STATUS.ACTIVE, score: 75 },
          { ...user, skey: 'item#004', status: STATUS.ACTIVE, score: 25 },
        ]);

        const result = await Effect.runPromise(
          table.query(
            { pk: user.pkey },
            {
              FilterExpression: '#status = :status AND #score > :minScore',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#score': 'score',
              },
              ExpressionAttributeValues: {
                ':status': STATUS.ACTIVE,
                ':minScore': 50,
              } as any,
            },
          ),
        );

        expectItemCount(result.Items, 2);
        expect(result.Items[0]).toMatchObject({
          skey: 'item#001',
          status: STATUS.ACTIVE,
          score: 100,
        });
        expect(result.Items[1]).toMatchObject({
          skey: 'item#003',
          status: STATUS.ACTIVE,
          score: 75,
        });
      });

      it('should query with projection expression', async () => {
        const user = createUser('proj001');
        const item = {
          ...user,
          skey: 'profile',
          email: 'user@example.com',
          name: 'Test User',
          age: 30,
          address: '123 Test St',
          phone: '555-1234',
        };
        await Effect.runPromise(table.putItem(item));

        const result = await Effect.runPromise(
          table.query(
            { pk: user.pkey, sk: 'profile' },
            {
              ProjectionExpression: '#pk, #sk, #name, #email',
              ExpressionAttributeNames: {
                '#pk': 'pkey',
                '#sk': 'skey',
                '#name': 'name',
                '#email': 'email',
              },
            },
          ),
        );

        expectItemCount(result.Items, 1);
        const resultItem = result.Items[0];

        expect(Object.keys(resultItem).sort()).toEqual([
          'email',
          'name',
          'pkey',
          'skey',
        ]);
        expect(resultItem.name).toBe('Test User');
        expect(resultItem.email).toBe('user@example.com');
        expect(resultItem.age).toBeUndefined();
        expect(resultItem.address).toBeUndefined();
      });

      it('should query with consistent read', async () => {
        const user = createUser('consistent001');
        await batchPutItems(table, [
          { ...user, skey: 'item#001' },
          { ...user, skey: 'item#002' },
        ]);

        const result = await Effect.runPromise(
          table.query({ pk: user.pkey }, { ConsistentRead: true }),
        );

        expectItemCount(result.Items, 2);
      });

      it('should combine filter and projection expressions', async () => {
        const user = createUser('complex001');
        await batchPutItems(table, [
          {
            ...user,
            skey: 'order#001',
            total: 100,
            status: 'completed',
            customer: 'John',
            items: 5,
          },
          {
            ...user,
            skey: 'order#002',
            total: 250,
            status: 'pending',
            customer: 'Jane',
            items: 3,
          },
          {
            ...user,
            skey: 'order#003',
            total: 175,
            status: 'completed',
            customer: 'Bob',
            items: 2,
          },
        ]);

        const result = await Effect.runPromise(
          table.query(
            { pk: user.pkey },
            {
              FilterExpression: '#status = :status AND #total > :minTotal',
              ProjectionExpression: '#sk, #customer, #total',
              ExpressionAttributeNames: {
                '#status': 'status',
                '#total': 'total',
                '#sk': 'skey',
                '#customer': 'customer',
              },
              ExpressionAttributeValues: {
                ':status': 'completed',
                ':minTotal': 150,
              } as any,
            },
          ),
        );

        expectItemCount(result.Items, 1);
        const item = result.Items[0];
        expect(Object.keys(item).sort()).toEqual(['customer', 'skey', 'total']);
        expect(item).toMatchObject({
          skey: 'order#003',
          customer: 'Bob',
          total: 175,
        });
      });

      it('should query with pagination', async () => {
        const user = createUser('014');
        const items: UserItem[] = [];
        for (let i = 1; i <= 5; i++) {
          items.push({
            ...user,
            skey: `item#${i.toString().padStart(3, '0')}`,
          });
        }
        await batchPutItems(table, items);

        const page1 = await Effect.runPromise(
          table.query({ pk: user.pkey }, { Limit: 2 }),
        );
        expectItemCount(page1.Items, 2);

        if (page1.LastEvaluatedKey) {
          const page2 = await Effect.runPromise(
            table.query(
              { pk: user.pkey },
              {
                Limit: 2,
                ExclusiveStartKey: page1.LastEvaluatedKey as any,
              },
            ),
          );
          expect(page2.Items.length).toBeGreaterThan(0);
          expect(page2.Items[0].skey).not.toBe(page1.Items[0].skey);
        }
      });

      it('should query in reverse order with ScanIndexForward', async () => {
        const user = createUser('015');
        await batchPutItems(table, [
          { ...user, skey: 'a' },
          { ...user, skey: 'b' },
          { ...user, skey: 'c' },
        ]);

        const forward = await Effect.runPromise(
          table.query({ pk: user.pkey }, { ScanIndexForward: true }),
        );

        const reverse = await Effect.runPromise(
          table.query({ pk: user.pkey }, { ScanIndexForward: false }),
        );

        expect(forward.Items[0].skey).toBe('a');
        expect(reverse.Items[0].skey).toBe('c');
      });
    });
  });

  describe('scan Operations', () => {
    it('should scan all items', async () => {
      const users = [createUser('016'), createUser('017'), createUser('018')];
      await batchPutItems(table, users);

      const result = await Effect.runPromise(table.scan({ Limit: 10 }));

      expect(result.Items.length).toBeGreaterThanOrEqual(3);
    });

    it('should scan with filter expression', async () => {
      const users = [
        createUser('019', { status: STATUS.ACTIVE, score: 100 }),
        createUser('020', { status: STATUS.ACTIVE, score: 50 }),
        createUser('021', { status: STATUS.INACTIVE, score: 200 }),
      ];
      await batchPutItems(table, users);

      const result = await Effect.runPromise(
        table.scan({
          FilterExpression: '#status = :status AND #score > :minScore',
          ExpressionAttributeNames: { '#status': 'status', '#score': 'score' },
          ExpressionAttributeValues: {
            ':status': STATUS.ACTIVE,
            ':minScore': 75,
          } as any,
        }),
      );

      expectItemCount(result.Items, 1);
      expect(result.Items[0]).toMatchObject({
        status: STATUS.ACTIVE,
        score: 100,
      });
    });

    it('should scan with projection expression', async () => {
      const users = [
        createUser('022', { level: 5, points: 1000, badges: ['gold'] }),
        createUser('023', { level: 3, points: 500, badges: ['silver'] }),
        createUser('024', { level: 7, points: 2000, badges: ['platinum'] }),
      ];
      await batchPutItems(table, users);

      const result = await Effect.runPromise(
        table.scan({
          ProjectionExpression: '#pk, #level, #points',
          ExpressionAttributeNames: {
            '#pk': 'pkey',
            '#level': 'level',
            '#points': 'points',
          },
          FilterExpression: '#level > :minLevel',
          ExpressionAttributeValues: {
            ':minLevel': 4,
          } as any,
        }),
      );

      expectItemCount(result.Items, 2);
      result.Items.forEach((item) => {
        expect(Object.keys(item).sort()).toEqual(['level', 'pkey', 'points']);
        expect(item.badges).toBeUndefined();
        expect(item.level).toBeGreaterThan(4);
      });
    });

    it('should scan with consistent read', async () => {
      const users = [createUser('025'), createUser('026')];
      await batchPutItems(table, users);

      const result = await Effect.runPromise(
        table.scan({
          ConsistentRead: true,
          Limit: 10,
        }),
      );

      expect(result.Items.length).toBeGreaterThanOrEqual(2);
    });

    it('should scan with pagination', async () => {
      const users: UserItem[] = [];
      for (let i = 1; i <= 5; i++) {
        users.push(createUser(`scan${i.toString().padStart(3, '0')}`));
      }
      await batchPutItems(table, users);

      const page1 = await Effect.runPromise(table.scan({ Limit: 2 }));
      expect(page1.Items.length).toBeGreaterThan(0);

      if (page1.LastEvaluatedKey) {
        const page2 = await Effect.runPromise(
          table.scan({
            Limit: 2,
            ExclusiveStartKey: page1.LastEvaluatedKey as any,
          }),
        );
        expect(page2.Items.length).toBeGreaterThan(0);
      }
    });
  });
});
