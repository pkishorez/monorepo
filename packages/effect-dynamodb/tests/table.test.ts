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
});

