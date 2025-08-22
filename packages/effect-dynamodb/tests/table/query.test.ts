import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from '../setup.js';

// Minimal test utilities
function createItem(
  pk: string,
  sk: string,
  overrides: Record<string, any> = {},
) {
  return {
    pkey: pk,
    skey: sk,
    name: `Item ${sk}`,
    status: 'active',
    score: 100,
    ...overrides,
  };
}

async function batchPutItems(items: any[]) {
  for (const item of items) {
    await Effect.runPromise(table.putItem(item));
  }
}

beforeEach(async () => {
  await cleanTable();
});

describe('query Operations', () => {
  describe('basic Query', () => {
    it('should query by partition key only', async () => {
      const pk = 'user#001';
      const items = [
        createItem(pk, 'profile'),
        createItem(pk, 'settings'),
        createItem('user#002', 'profile'), // Different partition
      ];
      await batchPutItems(items);

      const result = await Effect.runPromise(table.query({ pk }));

      expect(result.Items).toHaveLength(2);
      expect(result.Items.every((item) => item.pkey === pk)).toBe(true);
    });

    it('should query with sort key conditions', async () => {
      const pk = 'user#002';
      const items = [
        createItem(pk, 'item#001'),
        createItem(pk, 'item#002'),
        createItem(pk, 'item#003'),
        createItem(pk, 'other#001'),
      ];
      await batchPutItems(items);

      // String equality
      const exactResult = await Effect.runPromise(
        table.query({ pk, sk: 'item#002' }),
      );
      expect(exactResult.Items).toHaveLength(1);
      expect(exactResult.Items[0].skey).toBe('item#002');

      // Operator equality
      const opResult = await Effect.runPromise(
        table.query({ pk, sk: { '=': 'item#002' } }),
      );
      expect(opResult.Items).toHaveLength(1);

      // BeginsWith
      const beginsResult = await Effect.runPromise(
        table.query({ pk, sk: { 'beginsWith': 'item#' } }),
      );
      expect(beginsResult.Items).toHaveLength(3);

      // Less than
      const ltResult = await Effect.runPromise(
        table.query({ pk, sk: { '<': 'item#002' } }),
      );
      expect(ltResult.Items).toHaveLength(1);
      expect(ltResult.Items[0].skey).toBe('item#001');

      // Greater than or equal
      const gteResult = await Effect.runPromise(
        table.query({ pk, sk: { '>=': 'item#002' } }),
      );
      expect(gteResult.Items.length).toBeGreaterThanOrEqual(2);

      // Between
      const betweenResult = await Effect.runPromise(
        table.query({
          pk,
          sk: { 'between': ['item#001', 'item#002'] },
        }),
      );
      expect(betweenResult.Items).toHaveLength(2);
    });
  });

  describe('advanced Query Features', () => {
    it('should apply filter expression', async () => {
      const pk = 'user#003';
      const items = [
        createItem(pk, 'item#001', { score: 150, status: 'active' }),
        createItem(pk, 'item#002', { score: 50, status: 'active' }),
        createItem(pk, 'item#003', { score: 200, status: 'inactive' }),
      ];
      await batchPutItems(items);

      const result = await Effect.runPromise(
        table.query(
          { pk },
          {
            filter: {
              'and': [
                { attr: 'score', condition: { '>': 100 } },
                { attr: 'status', condition: { '=': 'active' } },
              ],
            },
          },
        ),
      );

      expect(result.Items).toHaveLength(1);
      expect(result.Items[0]).toMatchObject({ score: 150, status: 'active' });
    });

    it('should apply projection expression', async () => {
      const pk = 'user#004';
      const item = createItem(pk, 'profile', {
        email: 'test@example.com',
        phone: '555-1234',
        address: '123 Main St',
      });
      await batchPutItems([item]);

      const result = await Effect.runPromise(
        table.query(
          { pk },
          {
            projection: ['pkey', 'skey', 'name', 'email'],
          },
        ),
      );

      const returnedItem = result.Items[0];
      expect(Object.keys(returnedItem).sort()).toEqual([
        'email',
        'name',
        'pkey',
        'skey',
      ]);
      expect(returnedItem.phone).toBeUndefined();
      expect(returnedItem.address).toBeUndefined();
    });

    it('should handle pagination', async () => {
      const pk = 'user#005';
      const items = Array.from({ length: 5 }, (_, i) =>
        createItem(pk, `item#${i.toString().padStart(3, '0')}`),
      );
      await batchPutItems(items);

      const page1 = await Effect.runPromise(table.query({ pk }, { Limit: 2 }));
      expect(page1.Items).toHaveLength(2);
      expect(page1.LastEvaluatedKey).toBeDefined();

      const page2 = await Effect.runPromise(
        table.query(
          { pk },
          { Limit: 2, exclusiveStartKey: page1.LastEvaluatedKey },
        ),
      );
      expect(page2.Items).toHaveLength(2);
      expect(page2.Items[0].skey).not.toBe(page1.Items[0].skey);
    });

    it('should handle reverse order and consistent read', async () => {
      const pk = 'user#006';
      const items = [
        createItem(pk, 'a'),
        createItem(pk, 'b'),
        createItem(pk, 'c'),
      ];
      await batchPutItems(items);

      // Forward order
      const forward = await Effect.runPromise(
        table.query({ pk }, { ScanIndexForward: true }),
      );
      expect(forward.Items.map((i) => i.skey)).toEqual(['a', 'b', 'c']);

      // Reverse order
      const reverse = await Effect.runPromise(
        table.query({ pk }, { ScanIndexForward: false }),
      );
      expect(reverse.Items.map((i) => i.skey)).toEqual(['c', 'b', 'a']);

      // Consistent read
      const consistent = await Effect.runPromise(
        table.query({ pk }, { ConsistentRead: true }),
      );
      expect(consistent.Items).toHaveLength(3);
    });
  });

  describe('scan Operations', () => {
    it('should scan with filters and projections', async () => {
      const items = [
        createItem('user#001', 'profile', { score: 150, level: 5 }),
        createItem('user#002', 'profile', { score: 50, level: 2 }),
        createItem('user#003', 'profile', { score: 200, level: 8 }),
      ];
      await batchPutItems(items);

      // Scan with filter
      const filtered = await Effect.runPromise(
        table.scan({
          filter: {
            attr: 'score',
            condition: { '>': 100 },
          },
        }),
      );
      expect(filtered.Items.length).toBeGreaterThanOrEqual(2);
      expect(filtered.Items.every((item) => (item.score as number) > 100)).toBe(
        true,
      );

      // Scan with projection
      const projected = await Effect.runPromise(
        table.scan({
          filter: {
            attr: 'level',
            condition: { '>': 3 },
          },
          projection: ['pkey', 'level'],
        }),
      );
      expect(projected.Items.length).toBeGreaterThanOrEqual(2);
      projected.Items.forEach((item) => {
        expect(Object.keys(item).sort()).toEqual(['level', 'pkey']);
        expect(item.level).toBeGreaterThan(3);
      });
    });

    it('should handle scan pagination', async () => {
      const items = Array.from({ length: 6 }, (_, i) =>
        createItem(`user#${i.toString().padStart(3, '0')}`, 'profile'),
      );
      await batchPutItems(items);

      const page1 = await Effect.runPromise(table.scan({ Limit: 3 }));
      expect(page1.Items.length).toBeGreaterThan(0);

      if (page1.LastEvaluatedKey) {
        const page2 = await Effect.runPromise(
          table.scan({
            Limit: 3,
            exclusiveStartKey: page1.LastEvaluatedKey,
          }),
        );
        expect(page2.Items.length).toBeGreaterThan(0);
      }
    });
  });

  describe('edge Cases', () => {
    it('should handle empty results gracefully', async () => {
      // Query non-existent partition
      const queryResult = await Effect.runPromise(
        table.query({ pk: 'nonexistent#key' }),
      );
      expect(queryResult.Items).toHaveLength(0);

      // Query with no matching sort key
      await batchPutItems([createItem('user#007', 'profile')]);
      const noMatchResult = await Effect.runPromise(
        table.query({
          pk: 'user#007',
          sk: { 'beginsWith': 'nonmatching' },
        }),
      );
      expect(noMatchResult.Items).toHaveLength(0);

      // Scan with no matching filter
      const scanResult = await Effect.runPromise(
        table.scan({
          filter: {
            attr: 'score',
            condition: { '>': 10000 },
          },
        }),
      );
      expect(Array.isArray(scanResult.Items)).toBe(true);
    });

    it('should handle between range edge cases', async () => {
      const pk = 'user#008';
      await batchPutItems([createItem(pk, 'item#005')]);

      // Valid range with no items
      const result = await Effect.runPromise(
        table.query({
          pk,
          sk: { 'between': ['item#001', 'item#003'] },
        }),
      );
      expect(result.Items).toHaveLength(0);
    });
  });
});
