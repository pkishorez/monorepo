import { Effect, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { DynamoEntity } from '../src/entity/entity.js';
import { ESchema } from '@monorepo/eschema';
import { cleanTable, table } from './setup.js';

// Complex schema covering multiple use cases
const ProductSchema = Schema.Struct({
  id: Schema.String,
  sku: Schema.String,
  name: Schema.String,
  category: Schema.String,
  price: Schema.Number,
  inStock: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  metadata: Schema.Struct({
    description: Schema.String,
    manufacturer: Schema.String,
  }),
  dimensions: Schema.optional(
    Schema.Struct({
      width: Schema.Number,
      height: Schema.Number,
      depth: Schema.Number,
    }),
  ),
  reviews: Schema.optional(
    Schema.Struct({
      count: Schema.Number,
      average: Schema.Number,
    }),
  ),
});

type Product = typeof ProductSchema.Type;

const productESchema = ESchema.make('v1', ProductSchema).build();

const productEntity = DynamoEntity.make(table)
  .eschema(productESchema)
  .primary({
    pk: { deps: ['category'], derive: ({ category }) => ['PRODUCT', category] },
    sk: { deps: ['id', 'sku'], derive: ({ id, sku }) => ['ID', id, 'SKU', sku] },
  })
  .index('GSI1', 'byCategory', {
    pk: { deps: ['category'], derive: ({ category }) => ['CAT', category] },
    sk: { deps: ['name'], derive: ({ name }) => ['NAME', name] },
  })
  .index('GSI2', 'bySku', {
    pk: { deps: ['sku'], derive: ({ sku }) => ['SKU', sku] },
    sk: {
      deps: ['price'],
      derive: ({ price }) => ['PRICE', price.toString().padStart(10, '0')],
    },
  })
  .build();

describe('Entity Operations', () => {
  beforeEach(async () => {
    await cleanTable();
  });

  describe('Insert', () => {
    it('should insert item with full schema validation', async () => {
      const product: Product = {
        id: 'prod-001',
        sku: 'SKU-LAPTOP-001',
        name: 'Gaming Laptop',
        category: 'electronics',
        price: 1299.99,
        inStock: true,
        tags: ['gaming', 'laptop', 'high-performance'],
        metadata: {
          description: 'High-end gaming laptop',
          manufacturer: 'TechCorp',
        },
        dimensions: {
          width: 35,
          height: 2.5,
          depth: 25,
        },
      };

      await Effect.runPromise(productEntity.insert(product));

      const result = await Effect.runPromise(
        productEntity.get({ category: 'electronics', id: 'prod-001', sku: 'SKU-LAPTOP-001' }),
      );

      expect(result.item).not.toBeNull();
      expect(result.item?.value).toMatchObject(product);
      expect(result.item?.meta.__v).toBe('v1');
      expect(result.item?.meta.__i).toBe(0);
      expect(result.item?.meta.__d).toBe(false);
    });

    it('should auto-populate secondary indexes on insert', async () => {
      const product: Product = {
        id: 'prod-002',
        sku: 'SKU-MOUSE-001',
        name: 'Wireless Mouse',
        category: 'accessories',
        price: 29.99,
        inStock: true,
        tags: ['wireless', 'mouse'],
        metadata: {
          description: 'Ergonomic wireless mouse',
          manufacturer: 'PeripheralCo',
        },
      };

      await Effect.runPromise(productEntity.insert(product));

      // Query via GSI to verify indexes were populated
      const resultByCategory = await Effect.runPromise(
        productEntity.index('byCategory').query(
          { pk: { category: 'accessories' }, sk: { '>=': { name: 'Wireless' } } },
          {},
        ),
      );

      expect(resultByCategory.items.length).toBeGreaterThan(0);
      expect(resultByCategory.items[0].value.id).toBe('prod-002');

      const resultBySku = await Effect.runPromise(
        productEntity.index('bySku').query(
          { pk: { sku: 'SKU-MOUSE-001' }, sk: { '>=': { price: 0 } } },
          {},
        ),
      );

      expect(resultBySku.items).toHaveLength(1);
      expect(resultBySku.items[0].value.name).toBe('Wireless Mouse');
    });

    it('should reject duplicate insert', async () => {
      const product: Product = {
        id: 'prod-003',
        sku: 'SKU-KEYBOARD-001',
        name: 'Mechanical Keyboard',
        category: 'accessories',
        price: 149.99,
        inStock: false,
        tags: ['mechanical', 'keyboard'],
        metadata: {
          description: 'RGB mechanical keyboard',
          manufacturer: 'KeyMaster',
        },
      };

      await Effect.runPromise(productEntity.insert(product));
      const result = await Effect.runPromise(productEntity.insert(product));

      expect(result).toBeNull();
    });
  });

  describe('Get', () => {
    it('should retrieve existing item with metadata', async () => {
      const product: Product = {
        id: 'prod-004',
        sku: 'SKU-MONITOR-001',
        name: '4K Monitor',
        category: 'displays',
        price: 599.99,
        inStock: true,
        tags: ['4k', 'monitor', 'ultrawide'],
        metadata: {
          description: '32-inch 4K monitor',
          manufacturer: 'DisplayTech',
        },
        reviews: {
          count: 42,
          average: 4.5,
        },
      };

      await Effect.runPromise(productEntity.insert(product));

      const result = await Effect.runPromise(
        productEntity.get({ category: 'displays', id: 'prod-004', sku: 'SKU-MONITOR-001' }),
      );

      expect(result.item).not.toBeNull();
      expect(result.item?.value.name).toBe('4K Monitor');
      expect(result.item?.value.reviews?.count).toBe(42);
      expect(result.item?.meta.__v).toBe('v1');
      expect(result.item?.meta.__i).toBe(0);
    });

    it('should return null for non-existent item', async () => {
      const result = await Effect.runPromise(
        productEntity.get({ category: 'nonexistent', id: 'fake-id', sku: 'fake-sku' }),
      );

      expect(result.item).toBeNull();
    });
  });

  describe('Update', () => {
    it('should update fields and increment version counter', async () => {
      const product: Product = {
        id: 'prod-005',
        sku: 'SKU-HEADSET-001',
        name: 'Gaming Headset',
        category: 'audio',
        price: 89.99,
        inStock: true,
        tags: ['gaming', 'headset', 'wireless'],
        metadata: {
          description: 'Wireless gaming headset',
          manufacturer: 'AudioGear',
        },
      };

      await Effect.runPromise(productEntity.insert(product));

      await Effect.runPromise(
        productEntity.update(
          { category: 'audio', id: 'prod-005', sku: 'SKU-HEADSET-001' },
          { price: 79.99, inStock: false },
        ),
      );

      const result = await Effect.runPromise(
        productEntity.get({ category: 'audio', id: 'prod-005', sku: 'SKU-HEADSET-001' }),
      );

      expect(result.item?.value.price).toBe(79.99);
      expect(result.item?.value.inStock).toBe(false);
      expect(result.item?.value.name).toBe('Gaming Headset');
      expect(result.item?.meta.__i).toBe(1);
    });

    it('should fail with stale version (optimistic locking)', async () => {
      const product: Product = {
        id: 'prod-006',
        sku: 'SKU-TABLET-001',
        name: 'Tablet Pro',
        category: 'tablets',
        price: 799.99,
        inStock: true,
        tags: ['tablet', 'premium'],
        metadata: {
          description: 'Professional tablet',
          manufacturer: 'TabletCorp',
        },
      };

      await Effect.runPromise(productEntity.insert(product));

      const firstGet = await Effect.runPromise(
        productEntity.get({ category: 'tablets', id: 'prod-006', sku: 'SKU-TABLET-001' }),
      );

      // First update succeeds
      await Effect.runPromise(
        productEntity.update(
          { category: 'tablets', id: 'prod-006', sku: 'SKU-TABLET-001' },
          { price: 749.99 },
        ),
      );

      // Second update with old meta fails
      const result = await Effect.runPromise(
        Effect.either(
          productEntity.update(
            { category: 'tablets', id: 'prod-006', sku: 'SKU-TABLET-001' },
            { price: 699.99 },
            firstGet.item!.meta,
          ),
        ),
      );

      expect(result._tag).toBe('Left');
    });

    it('should re-derive secondary indexes on update', async () => {
      const product: Product = {
        id: 'prod-007',
        sku: 'SKU-PHONE-001',
        name: 'Smartphone X',
        category: 'phones',
        price: 999.99,
        inStock: true,
        tags: ['smartphone', 'flagship'],
        metadata: {
          description: 'Latest flagship phone',
          manufacturer: 'PhoneTech',
        },
      };

      await Effect.runPromise(productEntity.insert(product));

      // Update price, which affects GSI2
      await Effect.runPromise(
        productEntity.update(
          { category: 'phones', id: 'prod-007', sku: 'SKU-PHONE-001' },
          { price: 899.99 },
        ),
      );

      // Query via GSI2 to verify index was updated
      const result = await Effect.runPromise(
        productEntity.index('bySku').query(
          { pk: { sku: 'SKU-PHONE-001' }, sk: { '>=': { price: 0 } } },
          {},
        ),
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].value.price).toBe(899.99);
    });
  });

  describe('Query', () => {
    beforeEach(async () => {
      // Insert multiple products for query testing
      const products: Product[] = [
        {
          id: 'prod-100',
          sku: 'SKU-BOOK-001',
          name: 'TypeScript Handbook',
          category: 'books',
          price: 39.99,
          inStock: true,
          tags: ['programming', 'typescript'],
          metadata: { description: 'Learn TypeScript', manufacturer: 'TechBooks' },
        },
        {
          id: 'prod-101',
          sku: 'SKU-BOOK-002',
          name: 'Effect Programming',
          category: 'books',
          price: 49.99,
          inStock: true,
          tags: ['programming', 'effect'],
          metadata: { description: 'Master Effect', manufacturer: 'TechBooks' },
        },
        {
          id: 'prod-102',
          sku: 'SKU-BOOK-003',
          name: 'AWS Guide',
          category: 'books',
          price: 44.99,
          inStock: false,
          tags: ['cloud', 'aws'],
          metadata: { description: 'AWS essentials', manufacturer: 'CloudPress' },
        },
      ];

      for (const product of products) {
        await Effect.runPromise(productEntity.insert(product));
      }
    });

    it('should query primary index with sort key conditions', async () => {
      const result = await Effect.runPromise(
        productEntity.query(
          {
            pk: { category: 'books' },
            sk: { '>=': { id: 'prod-100', sku: 'SKU-BOOK-001' } },
          },
          {},
        ),
      );

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items.every((item) => item.value.category === 'books')).toBe(true);
    });

    it('should query GSI with sort key range', async () => {
      const result = await Effect.runPromise(
        productEntity.index('byCategory').query(
          {
            pk: { category: 'books' },
            sk: { between: [{ name: 'A' }, { name: 'Z' }] },
          },
          { ScanIndexForward: true },
        ),
      );

      expect(result.items).toHaveLength(3);
      expect(result.items[0].value.name).toBe('AWS Guide');
      expect(result.items[1].value.name).toBe('Effect Programming');
      expect(result.items[2].value.name).toBe('TypeScript Handbook');
    });
  });
});
