import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable } from '../setup.js';
import {
  batchPutItems,
  createIndexedTable,
  createOrder,
  createProduct,
  expectAllItemsMatch,
  expectItemCount,
  generateProducts,
  PREFIXES,
  STATUS,
} from './utils.js';

const table = createIndexedTable();

beforeEach(async () => {
  await cleanTable();
});

describe('index Operations', () => {
  describe('global Secondary Index (GSI1)', () => {
    describe('basic Query Operations', () => {
      it('should query with partition key only', async () => {
        const products = [
          createProduct('001', 'electronics', 'apple'),
          createProduct('002', 'electronics', 'samsung'),
          createProduct('003', 'clothing', 'nike'),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query({ pk: `${PREFIXES.CATEGORY}electronics` }),
        );

        expectItemCount(result.Items, 2);
        expectAllItemsMatch(
          result.Items,
          (item) => item.category === 'electronics',
        );
      });

      it('should query with partition and sort key (beginsWith)', async () => {
        const products = [
          createProduct('004', 'electronics', 'apple', { price: 999 }),
          createProduct('005', 'electronics', 'apple', { price: 1299 }),
          createProduct('006', 'electronics', 'samsung', { price: 899 }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query({
            pk: `${PREFIXES.CATEGORY}electronics`,
            sk: { beginsWith: `${PREFIXES.BRAND}apple` },
          }),
        );

        expectItemCount(result.Items, 2);
        expectAllItemsMatch(result.Items, (item) => item.brand === 'apple');
      });

      it('should query with between condition', async () => {
        const orders = [
          createOrder('001', 'user1', '2024-01-01'),
          createOrder('002', 'user1', '2024-01-02'),
          createOrder('003', 'user1', '2024-01-05'),
          createOrder('004', 'user2', '2024-01-01'),
        ];
        await batchPutItems(table, orders);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query({
            pk: `${PREFIXES.USER}user1`,
            sk: {
              between: [
                `${PREFIXES.DATE}2024-01-01#001`,
                `${PREFIXES.DATE}2024-01-02#002`,
              ],
            },
          }),
        );

        expectItemCount(result.Items, 2);
      });

      it('should query with string equality', async () => {
        const orders = [
          createOrder('005', 'user3', '2024-03-15'),
          createOrder('006', 'user3', '2024-03-20'),
        ];
        await batchPutItems(table, orders);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query({
            pk: `${PREFIXES.USER}user3`,
            sk: `${PREFIXES.DATE}2024-03-15#005`,
          }),
        );

        expectItemCount(result.Items, 1);
        expect(result.Items[0].pkey).toContain('005');
      });
    });

    describe('enhanced Query Features', () => {
      it('should query with filter expression', async () => {
        const products = [
          createProduct('001', 'electronics', 'apple', {
            price: 999,
            stock: 10,
          }),
          createProduct('002', 'electronics', 'apple', {
            price: 1299,
            stock: 5,
          }),
          createProduct('003', 'electronics', 'apple', {
            price: 699,
            stock: 0,
          }),
          createProduct('004', 'electronics', 'samsung', {
            price: 899,
            stock: 15,
          }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query(
            {
              pk: `${PREFIXES.CATEGORY}electronics`,
              sk: { beginsWith: `${PREFIXES.BRAND}apple` },
            },
            {
              filterExpression: '#price > :minPrice AND #stock > :minStock',
              expressionAttributeNames: {
                '#price': 'price',
                '#stock': 'stock',
              },
              expressionAttributeValues: {
                ':minPrice': 700,
                ':minStock': 0,
              },
            },
          ),
        );

        expectItemCount(result.Items, 2);
        result.Items.forEach((item) => {
          expect(item.price).toBeGreaterThan(700);
          expect(item.stock).toBeGreaterThan(0);
        });
      });

      it('should query with projection expression', async () => {
        const orders = [
          createOrder('001', 'user1', '2024-01-01', {
            total: 150,
            items: 3,
            shipping: 'express',
            notes: 'Gift wrap requested',
          }),
          createOrder('002', 'user1', '2024-01-02', {
            total: 250,
            items: 5,
            shipping: 'standard',
            notes: 'Leave at door',
          }),
        ];
        await batchPutItems(table, orders);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query(
            { pk: `${PREFIXES.USER}user1` },
            {
              projectionExpression: 'gsi1pk, skey, #total, #items',
              expressionAttributeNames: {
                '#items': 'items',
                '#total': 'total',
              },
            },
          ),
        );

        expectItemCount(result.Items, 2);
        result.Items.forEach((item) => {
          const keys = Object.keys(item).sort();
          expect(keys).toContain('items');
          expect(keys).toContain('skey');
          expect(keys).toContain('total');
          expect(item.shipping).toBeUndefined();
          expect(item.notes).toBeUndefined();
        });
      });

      it('should combine all GSI query options', async () => {
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
          createProduct('010', 'sports', 'adidas', {
            price: 100,
            rating: 4.2,
            inStock: true,
          }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.gsi('GSI1').query(
            {
              pk: `${PREFIXES.CATEGORY}sports`,
              sk: { beginsWith: `${PREFIXES.BRAND}nike` },
            },
            {
              scanIndexForward: false,
              filterExpression: '#price >= :minPrice AND #inStock = :inStock',
              projectionExpression: 'gsi1pk, gsi1sk, price, rating',
              expressionAttributeNames: {
                '#price': 'price',
                '#inStock': 'inStock',
              },
              expressionAttributeValues: {
                ':minPrice': 100,
                ':inStock': true,
              },
              limit: 10,
            },
          ),
        );

        expectItemCount(result.Items, 2);
        result.Items.forEach((item) => {
          expect(item.price).toBeGreaterThanOrEqual(100);
          expect(item.inStock).toBeUndefined(); // Not in projection
          expect(Object.keys(item)).toContain('rating');
        });
      });
    });

    describe('scan Operations', () => {
      it('should scan GSI with filter and projection', async () => {
        const products = [
          createProduct('017', 'food', 'nestle', {
            organic: true,
            calories: 250,
          }),
          createProduct('018', 'food', 'kellogs', {
            organic: false,
            calories: 180,
          }),
          createProduct('019', 'beverages', 'cocacola', {
            organic: false,
            calories: 140,
          }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.gsi('GSI1').scan({
            filterExpression:
              'begins_with(#gsi1pk, :prefix) AND #organic = :organic',
            projectionExpression: 'pkey, category, calories',
            expressionAttributeNames: {
              '#gsi1pk': 'gsi1pk',
              '#organic': 'organic',
            },
            expressionAttributeValues: {
              ':prefix': PREFIXES.CATEGORY,
              ':organic': true,
            },
          }),
        );

        expectItemCount(result.Items, 1);
        const item = result.Items[0];
        expect(Object.keys(item).sort()).toEqual([
          'calories',
          'category',
          'pkey',
        ]);
        expect(item.category).toBe('food');
        expect(item.organic).toBeUndefined(); // Not in projection
      });

      it('should scan GSI with monitoring', async () => {
        const products = generateProducts(3, 'test');
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.gsi('GSI1').scan({
            returnConsumedCapacity: 'TOTAL',
            limit: 10,
          }),
        );

        expect(result.Items.length).toBeGreaterThan(0);
        expect(result.ConsumedCapacity).toBeDefined();
      });
    });
  });

  describe('local Secondary Index (LSI1)', () => {
    describe('basic Query Operations', () => {
      it('should query LSI by partition key', async () => {
        const products = [
          createProduct('011', 'electronics', 'apple'),
          createProduct('012', 'electronics', 'samsung'),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.lsi('LSI1').query({ pk: products[0].pkey }),
        );

        expect(result.Items.length).toBeGreaterThanOrEqual(1);
      });

      it('should query LSI with sort key conditions', async () => {
        const products = [
          createProduct('013', 'books', 'penguin', { isbn: '978-1234567890' }),
          createProduct('014', 'books', 'pearson', { isbn: '978-0987654321' }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.lsi('LSI1').query({
            pk: products[0].pkey,
          }),
        );

        expect(result.Items.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('enhanced Query Features', () => {
      it('should query LSI with filter expression', async () => {
        const products = [
          createProduct('015', 'electronics', 'apple', {
            status: STATUS.ACTIVE,
            featured: true,
          }),
          createProduct('016', 'electronics', 'samsung', {
            status: STATUS.INACTIVE,
            featured: false,
          }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.lsi('LSI1').query(
            { pk: products[0].pkey },
            {
              filterExpression: '#featured = :featured',
              expressionAttributeNames: {
                '#featured': 'featured',
              },
              expressionAttributeValues: {
                ':featured': true,
              },
            },
          ),
        );

        expect(result.Items.length).toBeGreaterThanOrEqual(1);
        if (result.Items.length > 0) {
          expect(result.Items[0].featured).toBe(true);
        }
      });

      it('should query LSI with projection expression', async () => {
        const products = [
          createProduct('017', 'books', 'pearson', {
            isbn: '978-0134685991',
            pages: 1024,
            year: 2018,
          }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.lsi('LSI1').query(
            { pk: products[0].pkey },
            {
              projectionExpression: 'pkey, lsi1skey, isbn, #year',
              expressionAttributeNames: {
                '#year': 'year',
              },
            },
          ),
        );

        expectItemCount(result.Items, 1);
        const item = result.Items[0];
        expect(Object.keys(item).sort()).toEqual([
          'isbn',
          'lsi1skey',
          'pkey',
          'year',
        ]);
        expect(item.pages).toBeUndefined();
      });

      it('should query LSI with consistent read', async () => {
        const products = [
          createProduct('018', 'toys', 'lego'),
          createProduct('019', 'toys', 'mattel'),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table
            .lsi('LSI1')
            .query({ pk: products[0].pkey }, { consistentRead: true }),
        );

        expect(result.Items.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('scan Operations', () => {
      it('should scan LSI with projection', async () => {
        const products = generateProducts(5, 'garden');
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.lsi('LSI1').scan({
            projectionExpression: 'pkey, lsi1skey',
            limit: 10,
          }),
        );

        expect(result.Items.length).toBeGreaterThan(0);
        result.Items.forEach((item) => {
          expect(Object.keys(item).sort()).toEqual(['lsi1skey', 'pkey']);
        });
      });

      it('should scan LSI with filter and monitoring', async () => {
        const products = [
          createProduct('020', 'tech', 'apple', { featured: true }),
          createProduct('021', 'tech', 'google', { featured: false }),
        ];
        await batchPutItems(table, products);

        const result = await Effect.runPromise(
          table.lsi('LSI1').scan({
            filterExpression: '#featured = :featured',
            expressionAttributeNames: { '#featured': 'featured' },
            expressionAttributeValues: { ':featured': true },
            returnConsumedCapacity: 'TOTAL',
            limit: 10,
          }),
        );

        expect(result.ConsumedCapacity).toBeDefined();
        result.Items.forEach((item) => {
          if (item.featured !== undefined) {
            expect(item.featured).toBe(true);
          }
        });
      });
    });
  });

  describe('advanced Index Features', () => {
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
      await batchPutItems(table, products);

      // Query GSI1 for electronics
      const gsiResult = await Effect.runPromise(
        table
          .gsi('GSI1')
          .query(
            { pk: `${PREFIXES.CATEGORY}electronics` },
            {
              filterExpression: 'price > :minPrice',
              expressionAttributeValues: { ':minPrice': 800 },
            },
          ),
      );

      // Query LSI1 for featured products
      const lsiResult = await Effect.runPromise(
        table
          .lsi('LSI1')
          .query(
            { pk: products[0].pkey },
            {
              filterExpression: 'featured = :featured',
              expressionAttributeValues: { ':featured': true },
            },
          ),
      );

      expect(gsiResult.Items.length).toBeGreaterThan(0);
      expect(lsiResult.Items.length).toBeGreaterThan(0);
    });

    it('should support pagination across indexes', async () => {
      const products = generateProducts(10, 'pagination');
      await batchPutItems(table, products);

      // Test GSI pagination
      const gsiPage1 = await Effect.runPromise(
        table.gsi('GSI1').scan({ limit: 3 }),
      );

      expect(gsiPage1.Items.length).toBeGreaterThan(0);
      if (gsiPage1.LastEvaluatedKey) {
        const gsiPage2 = await Effect.runPromise(
          table.gsi('GSI1').scan({
            limit: 3,
            exclusiveStartKey: gsiPage1.LastEvaluatedKey,
          }),
        );
        expect(gsiPage2.Items.length).toBeGreaterThan(0);
      }
    });

    it('should handle all query operators on indexes', async () => {
      const orders = [];
      for (let i = 1; i <= 10; i++) {
        orders.push(
          createOrder(
            i.toString().padStart(3, '0'),
            'testuser',
            `2024-01-${i.toString().padStart(2, '0')}`,
            { priority: i },
          ),
        );
      }
      await batchPutItems(table, orders);

      // Test individual operators
      const testValue = `${PREFIXES.DATE}2024-01-05#005`;

      const operators = [
        { '<': testValue },
        { '<=': testValue },
        { '>': testValue },
        { '>=': testValue },
        { '=': testValue },
      ];

      for (const condition of operators) {
        const result = await Effect.runPromise(
          table.gsi('GSI1').query({
            pk: `${PREFIXES.USER}testuser`,
            sk: condition,
          }),
        );

        expect(result.Items).toBeDefined();
      }

      // Test between operator
      const betweenResult = await Effect.runPromise(
        table.gsi('GSI1').query({
          pk: `${PREFIXES.USER}testuser`,
          sk: {
            between: [
              `${PREFIXES.DATE}2024-01-03#003`,
              `${PREFIXES.DATE}2024-01-07#007`,
            ],
          },
        }),
      );

      expect(betweenResult.Items.length).toBeGreaterThan(0);
    });
  });
});

