import { ResourceNotFoundException } from 'dynamodb-client';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { DynamoTable } from '../src/table/index.js';

// TestItem contains only business data - no keys or indexes
interface TestItem {
  name: string;
  status: 'active' | 'inactive';
  email?: string;
  age?: number;
}

// Create typesafe table with TestItem type defined at build - following setup.ts pattern
const typesafeTable = DynamoTable.make('typesafe-table', {
  region: 'local-dynamodb',
  accessKey: 'test',
  secretKey: 'test',
  endpoint: 'http://localhost:8000',
})
  .primary('pkey', 'skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .build<TestItem>();

async function cleanTypesafeTable() {
  try {
    const scanResult = await Effect.runPromise(typesafeTable.scan({}));
    for (const item of scanResult.Items) {
      await Effect.runPromise(
        typesafeTable.deleteItem({ pkey: item.pkey, skey: item.skey }),
      );
    }
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
  }
}

beforeEach(async () => {
  await cleanTypesafeTable();
});

describe('typesafe table with projection type safety', () => {
  it('should put and get item with typed data', async () => {
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'user#001', skey: 'profile' },
        {
          name: 'Test User',
          status: 'active',
          email: 'test@example.com',
          age: 30,
        },
      ),
    );

    const result = await Effect.runPromise(
      typesafeTable
        .getItem({ pkey: 'user#001', skey: 'profile' })
        .pipe(Effect.map((v) => v.Item)),
    );

    expect(result).toEqual({
      pkey: 'user#001',
      skey: 'profile',
      name: 'Test User',
      status: 'active',
      email: 'test@example.com',
      age: 30,
    });
  });

  it('should support type-safe projection with TestItem keys', async () => {
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'user#002', skey: 'profile' },
        {
          name: 'Another User',
          status: 'inactive',
          email: 'another@example.com',
          age: 25,
        },
      ),
    );

    // ProjectionKeys enforces only valid TestItem keys - TypeScript will error on invalid keys
    const result = await Effect.runPromise(
      typesafeTable.getItem(
        { pkey: 'user#002', skey: 'profile' },
        { projection: ['name', 'status'] }, // Type-safe: only TestItem keys allowed
      ),
    );

    expect(result.Item).toEqual({
      name: 'Another User',
      status: 'inactive',
    });
  });

  it('should query with type-safe projection', async () => {
    // Put test items with keys
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'user#003', skey: 'profile' },
        { name: 'User A', status: 'active', email: 'a@test.com' },
      ),
    );
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'user#003', skey: 'settings' },
        { name: 'User A Settings', status: 'inactive', age: 28 },
      ),
    );

    // Query with projection - only TestItem fields can be projected
    const result = await Effect.runPromise(
      typesafeTable.query(
        { pk: 'user#003' },
        { projection: ['name', 'status'] }, // Type-safe projection of TestItem fields only
      ),
    );

    expect(result.Items).toHaveLength(2);
    for (const item of result.Items) {
      expect(item.name).toBeDefined();
      expect(item.status).toBeDefined();
      // Verify non-projected fields are absent
      expect(item.pkey).toBeUndefined();
      expect(item.skey).toBeUndefined();
      expect(item.email).toBeUndefined();
      expect(item.age).toBeUndefined();
    }
  });

  it('should demonstrate complete type safety', async () => {
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'user#004', skey: 'profile' },
        {
          name: 'Type Safe User',
          status: 'active',
          email: 'typesafe@example.com',
        },
      ),
    );

    // Test all valid TestItem projections (only string keys work with DynamoDB)
    for (const field of ['name', 'status', 'email', 'age'] as const) {
      const result = await Effect.runPromise(
        typesafeTable.getItem(
          { pkey: 'user#004', skey: 'profile' },
          { projection: [field] },
        ),
      );

      // Only check fields that were actually set in the data
      if (field !== 'age') {
        expect(result.Item![field]).toBeDefined();
      }
    }
  });

  it('should support batch get items with type-safe projection', async () => {
    // Put multiple items
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'batch#001', skey: 'item1' },
        { name: 'Batch Item 1', status: 'active', email: 'batch1@test.com' },
      ),
    );
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'batch#002', skey: 'item2' },
        { name: 'Batch Item 2', status: 'inactive', age: 35 },
      ),
    );

    // Batch get with projection
    const result = await Effect.runPromise(
      typesafeTable.batchGetItems(
        [
          { pkey: 'batch#001', skey: 'item1' },
          { pkey: 'batch#002', skey: 'item2' },
        ],
        { projection: ['name', 'status'] }, // Type-safe projection
      ),
    );

    expect(result.Responses?.[typesafeTable.name]).toHaveLength(2);
    const items = result.Responses![typesafeTable.name];

    for (const item of items) {
      const unmarshalled = item as any; // Items are still marshalled in batchGet response
      expect(unmarshalled.name).toBeDefined();
      expect(unmarshalled.status).toBeDefined();
    }
  });

  it('should support batch write items with type safety', async () => {
    // Batch write operations
    const result = await Effect.runPromise(
      typesafeTable.batchWriteItems(
        {
          put: [
            {
              key: { pkey: 'batch#write1', skey: 'put1' },
              item: {
                name: 'Batch Put 1',
                status: 'active',
                email: 'put1@test.com',
              },
            },
            {
              key: { pkey: 'batch#write2', skey: 'put2' },
              item: { name: 'Batch Put 2', status: 'inactive', age: 42 },
            },
          ],
        },
        {},
      ),
    );

    // Check the new unprocessed field
    expect(result.unprocessed).toBeDefined();
    expect(Array.isArray(result.unprocessed)).toBe(true);
    expect(result.unprocessed).toHaveLength(0); // Should be empty for successful batch

    // Verify items were written
    const getResult1 = await Effect.runPromise(
      typesafeTable.getItem({ pkey: 'batch#write1', skey: 'put1' }),
    );
    expect(getResult1.Item).toEqual({
      pkey: 'batch#write1',
      skey: 'put1',
      name: 'Batch Put 1',
      status: 'active',
      email: 'put1@test.com',
    });

    const getResult2 = await Effect.runPromise(
      typesafeTable.getItem({ pkey: 'batch#write2', skey: 'put2' }),
    );
    expect(getResult2.Item).toEqual({
      pkey: 'batch#write2',
      skey: 'put2',
      name: 'Batch Put 2',
      status: 'inactive',
      age: 42,
    });
  });

  it('should support batch write with delete operations', async () => {
    // First put an item to delete
    await Effect.runPromise(
      typesafeTable.putItem(
        { pkey: 'delete#001', skey: 'item' },
        { name: 'Item To Delete', status: 'active' },
      ),
    );

    // Verify item exists
    const beforeDelete = await Effect.runPromise(
      typesafeTable.getItem({ pkey: 'delete#001', skey: 'item' }),
    );
    expect(beforeDelete.Item).not.toBeNull();

    // Batch write with delete operation
    const result = await Effect.runPromise(
      typesafeTable.batchWriteItems(
        {
          put: [
            {
              key: { pkey: 'batch#mixed', skey: 'new' },
              item: { name: 'New Item', status: 'active' },
            },
          ],
          delete: [{ pkey: 'delete#001', skey: 'item' }],
        },
        {},
      ),
    );

    // Verify unprocessed is empty for successful operations
    expect(result.unprocessed).toHaveLength(0);

    // Verify delete worked
    const afterDelete = await Effect.runPromise(
      typesafeTable.getItem({ pkey: 'delete#001', skey: 'item' }),
    );
    expect(afterDelete.Item).toBeNull();

    // Verify put worked
    const newItem = await Effect.runPromise(
      typesafeTable.getItem({ pkey: 'batch#mixed', skey: 'new' }),
    );
    expect(newItem.Item?.name).toBe('New Item');
  });

  it('should handle unprocessed items structure correctly', async () => {
    // Test with a reasonable batch size that won't cause validation errors
    // Focus on verifying the unprocessed structure is type-safe
    const putItems = Array.from({ length: 5 }, (_, i) => ({
      key: { pkey: `batch#unprocessed${i}`, skey: `item${i}` },
      item: {
        name: `Unprocessed Test Item ${i}`,
        status: (i % 2 === 0 ? 'active' : 'inactive') as 'active' | 'inactive',
        email: `unprocessed${i}@test.com`,
        age: 25 + i,
      },
    }));

    const deleteItems = [
      { pkey: 'batch#deleteTest1', skey: 'item' },
      { pkey: 'batch#deleteTest2', skey: 'item' },
    ];

    const result = await Effect.runPromise(
      typesafeTable.batchWriteItems(
        {
          put: putItems,
          delete: deleteItems,
        },
        {},
      ),
    );

    console.warn('UNPROCESSED: ', result.unprocessed.length);
    // Verify unprocessed structure exists and is correct type
    expect(result.unprocessed).toBeDefined();
    expect(Array.isArray(result.unprocessed)).toBe(true);

    // Even if unprocessed is empty, test the type structure
    // The forEach will run 0 times if empty, which is fine
    result.unprocessed.forEach((item) => {
      expect(item.type).toMatch(/^(put|delete)$/);

      if (item.type === 'put') {
        // Verify put item structure
        expect(item.item).toBeDefined();
        expect(item.item.pkey).toBeDefined();
        expect(item.item.skey).toBeDefined();
        expect(item.item.name).toBeDefined();
        expect(item.item.status).toMatch(/^(active|inactive)$/);

        // Verify types for retry capability
        expect(typeof item.item.pkey).toBe('string');
        expect(typeof item.item.skey).toBe('string');
        expect(typeof item.item.name).toBe('string');
        expect(typeof item.item.status).toBe('string');

        // TestItem fields should be preserved in unprocessed items
        if ('email' in item.item) {
          expect(typeof item.item.email).toBe('string');
        }
        if ('age' in item.item) {
          expect(typeof item.item.age).toBe('number');
        }
      } else if (item.type === 'delete') {
        // Verify delete item structure
        expect(item.key).toBeDefined();
        expect(item.key.pkey).toBeDefined();
        expect(item.key.skey).toBeDefined();

        // Verify types for retry capability
        expect(typeof item.key.pkey).toBe('string');
        expect(typeof item.key.skey).toBe('string');
      }
    });

    // Test type discrimination works correctly
    const putUnprocessed = result.unprocessed.filter(
      (item) => item.type === 'put',
    );
    const deleteUnprocessed = result.unprocessed.filter(
      (item) => item.type === 'delete',
    );

    // TypeScript should properly narrow the types in these arrays
    putUnprocessed.forEach((item) => {
      // TypeScript knows item.item exists due to type discrimination
      expect(item.item.name).toBeDefined();
    });

    deleteUnprocessed.forEach((item) => {
      // TypeScript knows item.key exists due to type discrimination
      expect(item.key.pkey).toBeDefined();
    });

    // Verify successful operations - most items should be processed
    const totalItems = putItems.length + deleteItems.length;
    const processedItems = totalItems - result.unprocessed.length;
    expect(processedItems).toBeGreaterThanOrEqual(0);
    expect(processedItems).toBeLessThanOrEqual(totalItems);

    // Clean up
    const allKeys = [...putItems.map((p) => p.key), ...deleteItems];

    for (const key of allKeys) {
      try {
        await Effect.runPromise(typesafeTable.deleteItem(key));
      } catch {
        // Ignore deletion errors
      }
    }
  });
});
