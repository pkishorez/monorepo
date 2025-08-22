import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from '../setup.js';

// Test data factory for index operations
function createProduct(
  id: string,
  category: string,
  brand: string,
  overrides: Record<string, any> = {},
) {
  return {
    pkey: `product#${id}`,
    skey: `metadata#${id}`,
    gsi1pk: `category#${category}`,
    gsi1sk: `brand#${brand}#${id}`,
    gsi2pk: `brand#${brand}`,
    gsi2sk: `price#${(overrides.price || 100).toString().padStart(6, '0')}#${id}`,
    lsi1skey: `price#${overrides.price || 100}#${id}`,
    name: `Product ${id}`,
    category,
    brand,
    price: 100,
    stock: 50,
    ...overrides,
  };
}

function createOrder(
  orderId: string,
  userId: string,
  date: string,
  overrides: Record<string, any> = {},
) {
  return {
    pkey: `order#${orderId}`,
    skey: `details#${orderId}`,
    gsi1pk: `user#${userId}`,
    gsi1sk: `date#${date}#${orderId}`,
    gsi2pk: `status#${overrides.status || 'pending'}`,
    gsi2sk: `date#${date}#${orderId}`,
    lsi1skey: `status#${overrides.status || 'pending'}#${orderId}`,
    orderId,
    userId,
    date,
    status: 'pending',
    total: 250,
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

describe('index Operations', () => {
  describe('global Secondary Index (GSI)', () => {
    it('should query GSI with partition key only', async () => {
      const testId = 'Kishore';
      const products = [
        createProduct(`${testId}-001`, `electronics-${testId}`, 'apple'),
        createProduct(`${testId}-002`, `electronics-${testId}`, 'samsung'),
        createProduct(`${testId}-003`, `clothing-${testId}`, 'nike'),
      ];
      await batchPutItems(products);

      const result = await Effect.runPromise(
        table.gsi('GSI1').query({ pk: `category#electronics-${testId}` }),
      );

      expect(result.Items).toHaveLength(2);
      expect(
        result.Items.every((item) => item.category === `electronics-${testId}`),
      ).toBe(true);
    });

    it('should query GSI with sort key conditions', async () => {
      const testId = Date.now().toString();
      const products = [
        createProduct(`${testId}-004`, `electronics-${testId}`, 'apple', {
          price: 999,
        }),
        createProduct(`${testId}-005`, `electronics-${testId}`, 'apple', {
          price: 1299,
        }),
        createProduct(`${testId}-006`, `electronics-${testId}`, 'samsung', {
          price: 899,
        }),
      ];
      await batchPutItems(products);

      // BeginsWith condition
      const beginsResult = await Effect.runPromise(
        table.gsi('GSI1').query({
          pk: `category#electronics-${testId}`,
          sk: { 'beginsWith': 'brand#apple' },
        }),
      );
      expect(beginsResult.Items).toHaveLength(2);
      expect(beginsResult.Items.every((item) => item.brand === 'apple')).toBe(
        true,
      );

      // Between condition
      const orders = [
        createOrder('001', 'user1', '2024-01-01'),
        createOrder('002', 'user1', '2024-01-05'),
        createOrder('003', 'user1', '2024-01-10'),
      ];
      await batchPutItems(orders);

      const betweenResult = await Effect.runPromise(
        table.gsi('GSI1').query({
          pk: 'user#user1',
          sk: {
            'between': ['date#2024-01-01#001', 'date#2024-01-05#002'],
          },
        }),
      );
      expect(betweenResult.Items).toHaveLength(2);
    });

    it('should apply filter and projection on GSI queries', async () => {
      const products = [
        createProduct('007', 'sports', 'nike', {
          price: 120,
          rating: 4.5,
          inStock: true,
        }),
        createProduct('008', 'sports', 'nike', {
          price: 80,
          rating: 4.0,
          inStock: false,
        }),
        createProduct('009', 'sports', 'nike', {
          price: 150,
          rating: 4.8,
          inStock: true,
        }),
      ];
      await batchPutItems(products);

      const result = await Effect.runPromise(
        table.gsi('GSI1').query(
          {
            pk: 'category#sports',
            sk: { 'beginsWith': 'brand#nike' },
          },
          {
            filter: {
              price: { '>=': 100 },
              inStock: { '=': true },
            },
            projection: ['gsi1pk', 'gsi1sk', 'price', 'rating'],
            ScanIndexForward: false,
          },
        ),
      );

      expect(result.Items).toHaveLength(2);
      result.Items.forEach((item) => {
        expect(item.price).toBeGreaterThanOrEqual(100);
        expect(Object.keys(item)).toContain('rating');
        expect(item.inStock).toBeUndefined(); // Not in projection
      });
    });

    it('should scan GSI with filters', async () => {
      const products = [
        createProduct('010', 'food', 'nestle', {
          organic: true,
          calories: 250,
        }),
        createProduct('011', 'food', 'kelloggs', {
          organic: false,
          calories: 180,
        }),
        createProduct('012', 'beverages', 'cocacola', {
          organic: false,
          calories: 140,
        }),
      ];
      await batchPutItems(products);

      const result = await Effect.runPromise(
        table.gsi('GSI1').scan({
          filter: {
            gsi1pk: { 'beginsWith': 'category#' },
            organic: { '=': true },
          },
          projection: ['pkey', 'category', 'calories'],
        }),
      );

      expect(result.Items).toHaveLength(1);
      const item = result.Items[0];
      expect(Object.keys(item).sort()).toEqual([
        'calories',
        'category',
        'pkey',
      ]);
      expect(item.category).toBe('food');
    });

    it('should handle GSI pagination', async () => {
      const products = Array.from({ length: 10 }, (_, i) =>
        createProduct(
          i.toString().padStart(3, '0'),
          'pagination',
          `brand${i % 3}`,
        ),
      );
      await batchPutItems(products);

      const page1 = await Effect.runPromise(
        table.gsi('GSI1').scan({ Limit: 3 }),
      );
      expect(page1.Items.length).toBeGreaterThan(0);

      if (page1.LastEvaluatedKey) {
        const page2 = await Effect.runPromise(
          table.gsi('GSI1').scan({
            Limit: 3,
            exclusiveStartKey: page1.LastEvaluatedKey,
          }),
        );
        expect(page2.Items.length).toBeGreaterThan(0);
      }
    });
  });

  describe('local Secondary Index (LSI)', () => {
    it('should query LSI with basic operations', async () => {
      const products = [
        createProduct('013', 'electronics', 'apple'),
        createProduct('014', 'electronics', 'samsung'),
      ];
      await batchPutItems(products);

      // Query by partition key
      const result = await Effect.runPromise(
        table.lsi('LSI1').query({ pk: products[0].pkey }),
      );
      expect(result.Items.length).toBeGreaterThanOrEqual(1);

      // Query with sort key conditions would be similar to GSI
      // LSI inherits the partition key from the main table
    });

    it('should apply filter and projection on LSI', async () => {
      const products = [
        createProduct('015', 'electronics', 'apple', {
          status: 'active',
          featured: true,
        }),
        createProduct('016', 'electronics', 'samsung', {
          status: 'inactive',
          featured: false,
        }),
      ];
      await batchPutItems(products);

      const result = await Effect.runPromise(
        table.lsi('LSI1').query(
          { pk: products[0].pkey },
          {
            filter: {
              featured: { '=': true },
            },
            projection: ['pkey', 'lsi1skey', 'status'],
            ConsistentRead: true,
          },
        ),
      );

      if (result.Items.length > 0) {
        const item = result.Items[0];
        expect(Object.keys(item).sort()).toEqual([
          'lsi1skey',
          'pkey',
          'status',
        ]);
        expect(item.featured).toBeUndefined(); // Not in projection
      }
    });

    it('should scan LSI with monitoring', async () => {
      const products = Array.from({ length: 3 }, (_, i) =>
        createProduct(i.toString().padStart(3, '0'), 'garden', `brand${i}`),
      );
      await batchPutItems(products);

      const result = await Effect.runPromise(
        table.lsi('LSI1').scan({
          filter: {
            featured: { '=': true },
          },
          ReturnConsumedCapacity: 'TOTAL',
          projection: ['pkey', 'lsi1skey'],
        }),
      );

      expect(result.ConsumedCapacity).toBeDefined();
      result.Items.forEach((item) => {
        expect(Object.keys(item).sort()).toEqual(['lsi1skey', 'pkey']);
      });
    });
  });

  describe('multi-Index Operations', () => {
    it('should handle complex multi-index queries', async () => {
      const products = [
        createProduct('multi001', 'electronics', 'apple', {
          price: 999,
          featured: true,
        }),
        createProduct('multi002', 'electronics', 'samsung', {
          price: 799,
          featured: false,
        }),
        createProduct('multi003', 'clothing', 'nike', {
          price: 129,
          featured: true,
        }),
      ];
      await batchPutItems(products);

      // Query GSI1 for electronics
      const gsiResult = await Effect.runPromise(
        table.gsi('GSI1').query(
          { pk: 'category#electronics' },
          {
            filter: {
              price: { '>': 800 },
            },
          },
        ),
      );

      // Query LSI1 for featured products (if items exist in same partition)
      const lsiResult = await Effect.runPromise(
        table.lsi('LSI1').query(
          { pk: products[0].pkey },
          {
            filter: {
              featured: { '=': true },
            },
          },
        ),
      );

      expect(gsiResult.Items.length).toBeGreaterThan(0);
      expect(lsiResult.Items.length).toBeGreaterThan(0);
    });

    it('should test all query operators across indexes', async () => {
      const orders = Array.from({ length: 10 }, (_, i) =>
        createOrder(
          i.toString().padStart(3, '0'),
          'testuser',
          `2024-01-${(i + 1).toString().padStart(2, '0')}`,
          { priority: i + 1 },
        ),
      );
      await batchPutItems(orders);

      // Test individual operators on GSI
      const testValue = 'date#2024-01-05#004';
      const operators = ['<', '<=', '>', '>=', '='] as const;

      for (const op of operators) {
        const sk = op === '<' ? { '<': testValue } :
                  op === '<=' ? { '<=': testValue } :
                  op === '>' ? { '>': testValue } :
                  op === '>=' ? { '>=': testValue } :
                  { '=': testValue };
        
        const result = await Effect.runPromise(
          table.gsi('GSI1').query({
            pk: 'user#testuser',
            sk,
          }),
        );
        expect(result.Items).toBeDefined();
      }

      // Test between operator
      const betweenResult = await Effect.runPromise(
        table.gsi('GSI1').query({
          pk: 'user#testuser',
          sk: {
            'between': ['date#2024-01-03#002', 'date#2024-01-07#006'],
          },
        }),
      );
      expect(betweenResult.Items.length).toBeGreaterThan(0);
    });
  });

  describe('edge Cases', () => {
    it('should handle non-existent index queries', async () => {
      // GSI with non-existent partition
      const gsiResult = await Effect.runPromise(
        table.gsi('GSI1').query({ pk: 'category#nonexistent' }),
      );
      expect(gsiResult.Items).toHaveLength(0);

      // LSI with non-existent partition
      const lsiResult = await Effect.runPromise(
        table.lsi('LSI1').query({ pk: 'product#nonexistent' }),
      );
      expect(lsiResult.Items).toHaveLength(0);
    });

    it('should handle empty scan results', async () => {
      const gsiScanResult = await Effect.runPromise(
        table.gsi('GSI1').scan({
          filter: {
            price: { '>': 10000 },
          },
        }),
      );
      expect(Array.isArray(gsiScanResult.Items)).toBe(true);

      const lsiScanResult = await Effect.runPromise(
        table.lsi('LSI1').scan({
          filter: {
            score: { '>': 10000 },
          },
        }),
      );
      expect(Array.isArray(lsiScanResult.Items)).toBe(true);
    });
  });
});
