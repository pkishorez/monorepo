import type { DynamoTable } from '../src/table/index.js';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from './setup.js';

interface TestItem {
  category: string;
  itemId: string;
  name: string;
  price: number;
  inStock: boolean;
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

describe('query and Scan Operations', () => {
  beforeEach(async () => {
    await cleanTable();

    // Setup test data
    const testItems = [
      // Electronics category
      {
        key: { pkey: 'category#electronics', skey: 'item#001' },
        item: {
          category: 'electronics',
          itemId: '001',
          name: 'Laptop',
          price: 1200,
          inStock: true,
          gsi1pk: 'instock#true',
          gsi1sk: 'price#1200',
          lsi1skey: 'name#laptop',
        },
      },
      {
        key: { pkey: 'category#electronics', skey: 'item#002' },
        item: {
          category: 'electronics',
          itemId: '002',
          name: 'Phone',
          price: 800,
          inStock: true,
          gsi1pk: 'instock#true',
          gsi1sk: 'price#0800',
          lsi1skey: 'name#phone',
        },
      },
      {
        key: { pkey: 'category#electronics', skey: 'item#003' },
        item: {
          category: 'electronics',
          itemId: '003',
          name: 'Tablet',
          price: 600,
          inStock: false,
          gsi1pk: 'instock#false',
          gsi1sk: 'price#0600',
          lsi1skey: 'name#tablet',
        },
      },
      // Books category
      {
        key: { pkey: 'category#books', skey: 'item#004' },
        item: {
          category: 'books',
          itemId: '004',
          name: 'TypeScript Guide',
          price: 45,
          inStock: true,
          gsi1pk: 'instock#true',
          gsi1sk: 'price#0045',
          lsi1skey: 'name#typescript-guide',
        },
      },
      {
        key: { pkey: 'category#books', skey: 'item#005' },
        item: {
          category: 'books',
          itemId: '005',
          name: 'Effect Handbook',
          price: 50,
          inStock: true,
          gsi1pk: 'instock#true',
          gsi1sk: 'price#0050',
          lsi1skey: 'name#effect-handbook',
        },
      },
    ];

    // Insert all test items
    for (const { key, item } of testItems) {
      await Effect.runPromise(typedTable.putItem(key, item));
    }
  });

  describe('primary Key Query', () => {
    it('should query items by partition key', async () => {
      const result = await Effect.runPromise(
        typedTable.query({ pk: 'category#electronics' }),
      );

      expect(result.Items).toHaveLength(3);
      expect(
        result.Items.every((item) => item.category === 'electronics'),
      ).toBe(true);
      expect(result.Items.map((item) => item.name).sort()).toEqual([
        'Laptop',
        'Phone',
        'Tablet',
      ]);
    });

    it('should query with sort key condition', async () => {
      const result = await Effect.runPromise(
        typedTable.query({
          pk: 'category#electronics',
          sk: { beginsWith: 'item#00' },
        }),
      );

      expect(result.Items).toHaveLength(3);
      expect(
        result.Items.every((item) => item.skey.startsWith('item#00')),
      ).toBe(true);
    });

    it('should query with sort key range', async () => {
      const result = await Effect.runPromise(
        typedTable.query({
          pk: 'category#electronics',
          sk: { between: ['item#001', 'item#002'] },
        }),
      );

      expect(result.Items).toHaveLength(2);
      expect(result.Items.map((item) => item.itemId).sort()).toEqual([
        '001',
        '002',
      ]);
    });

    it('should limit query results', async () => {
      const result = await Effect.runPromise(
        typedTable.query({ pk: 'category#electronics' }, { Limit: 2 }),
      );

      expect(result.Items).toHaveLength(2);
      expect(result.LastEvaluatedKey).toBeDefined();
    });

    it('should support pagination', async () => {
      // First page
      const page1 = await Effect.runPromise(
        typedTable.query({ pk: 'category#electronics' }, { Limit: 2 }),
      );

      expect(page1.Items).toHaveLength(2);
      expect(page1.LastEvaluatedKey).toBeDefined();

      // Second page
      const page2 = await Effect.runPromise(
        typedTable.query(
          { pk: 'category#electronics' },
          { Limit: 2, exclusiveStartKey: page1.LastEvaluatedKey },
        ),
      );

      expect(page2.Items).toHaveLength(1);
      expect(page2.LastEvaluatedKey).toBeUndefined();

      // Verify no overlap
      const page1Ids = page1.Items.map((item) => item.itemId);
      const page2Ids = page2.Items.map((item) => item.itemId);
      expect(page1Ids.filter((id) => page2Ids.includes(id))).toHaveLength(0);
    });

    it('should query in reverse order', async () => {
      const result = await Effect.runPromise(
        typedTable.query(
          { pk: 'category#electronics' },
          { ScanIndexForward: false },
        ),
      );

      expect(result.Items).toHaveLength(3);
      expect(result.Items[0].itemId).toBe('003');
      expect(result.Items[2].itemId).toBe('001');
    });
  });

  describe('gSI Query', () => {
    it('should query GSI by partition key', async () => {
      const result = await Effect.runPromise(
        typedTable.index('GSI1').query({ pk: 'instock#true' }),
      );

      expect(result.Items).toHaveLength(4);
      expect(result.Items.every((item) => item.inStock === true)).toBe(true);
    });

    it('should query GSI with sort key condition', async () => {
      const result = await Effect.runPromise(
        typedTable.index('GSI1').query({
          pk: 'instock#true',
          sk: { '<': 'price#0100' },
        }),
      );

      expect(result.Items).toHaveLength(2); // Books only
      expect(result.Items.every((item) => item.price < 100)).toBe(true);
    });

    it('should paginate GSI queries', async () => {
      const page1 = await Effect.runPromise(
        typedTable.index('GSI1').query({ pk: 'instock#true' }, { Limit: 2 }),
      );

      expect(page1.Items).toHaveLength(2);
      expect(page1.LastEvaluatedKey).toBeDefined();

      const page2 = await Effect.runPromise(
        typedTable
          .index('GSI1')
          .query(
            { pk: 'instock#true' },
            { exclusiveStartKey: page1.LastEvaluatedKey },
          ),
      );

      expect(page2.Items.length).toBeGreaterThan(0);
    });
  });

  describe('lSI Query', () => {
    it('should query LSI with same partition key', async () => {
      const result = await Effect.runPromise(
        typedTable.index('LSI1').query({
          pk: 'category#electronics',
          sk: { beginsWith: 'name#' },
        }),
      );

      expect(result.Items).toHaveLength(3);
      expect(
        result.Items.every((item) => item.category === 'electronics'),
      ).toBe(true);
    });

    it('should order LSI results by alternate sort key', async () => {
      const result = await Effect.runPromise(
        typedTable.index('LSI1').query({ pk: 'category#electronics' }),
      );

      // Items should be ordered by name (lsi1skey)
      expect(result.Items).toHaveLength(3);
    });
  });

  describe('scan Operations', () => {
    it('should scan all items in table', async () => {
      const result = await Effect.runPromise(typedTable.scan());

      expect(result.Items).toHaveLength(5);
      expect(result.ScannedCount).toBe(5);
    });

    it('should limit scan results', async () => {
      const result = await Effect.runPromise(typedTable.scan({ Limit: 3 }));

      expect(result.Items).toHaveLength(3);
      expect(result.LastEvaluatedKey).toBeDefined();
    });

    it('should paginate scan results', async () => {
      const page1 = await Effect.runPromise(typedTable.scan({ Limit: 3 }));

      const page2 = await Effect.runPromise(
        page1.LastEvaluatedKey
          ? typedTable.scan({ exclusiveStartKey: page1.LastEvaluatedKey })
          : typedTable.scan(),
      );

      expect(page1.Items.length + page2.Items.length).toBe(5);

      // Verify no duplicates
      const page1Keys = page1.Items.map((item) => `${item.pkey}#${item.skey}`);
      const page2Keys = page2.Items.map((item) => `${item.pkey}#${item.skey}`);
      const allKeys = [...page1Keys, ...page2Keys];
      expect(new Set(allKeys).size).toBe(5);
    });

    it('should scan with projection', async () => {
      const result = await Effect.runPromise(
        typedTable.scan({ projection: ['name', 'price'] }),
      );

      expect(result.Items).toHaveLength(5);
      result.Items.forEach((item) => {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('price');
      });
    });

    it('should scan GSI', async () => {
      const result = await Effect.runPromise(typedTable.index('GSI1').scan());

      expect(result.Items).toHaveLength(5);
    });

    it('should scan LSI', async () => {
      const result = await Effect.runPromise(
        typedTable.index('LSI1').scan({ Limit: 10 }),
      );

      expect(result.Items).toHaveLength(5);
    });

    it('should scan with consistent read', async () => {
      const result = await Effect.runPromise(
        typedTable.scan({ ConsistentRead: true }),
      );

      expect(result.Items).toHaveLength(5);
    });
  });

  describe('empty Results', () => {
    it('should handle query with no results', async () => {
      const result = await Effect.runPromise(
        typedTable.query({ pk: 'category#nonexistent' }),
      );

      expect(result.Items).toHaveLength(0);
      expect(result.Count).toBe(0);
      expect(result.LastEvaluatedKey).toBeUndefined();
    });

    it('should handle GSI query with no results', async () => {
      const result = await Effect.runPromise(
        typedTable.index('GSI1').query({ pk: 'instock#maybe' }),
      );

      expect(result.Items).toHaveLength(0);
      expect(result.Count).toBe(0);
    });
  });
});

