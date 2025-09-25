import { Effect, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  deleteDatabase,
  storeSchema,
} from '../src/effect-idb.js';
import { ESchema } from '../src/eschema.js';

describe('effect-idb', () => {
  const testDbName = 'test-db';

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await Effect.runPromise(deleteDatabase(testDbName));
    } catch {
      // Database might not exist, ignore errors
    }
  });

  // Database setup functions
  async function createStoreOperationsDb() {
    const userSchema = ESchema.make(
      'v1',
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        email: Schema.String,
      }),
    ).build();

    return await createDatabase(
      testDbName,
      {
        users: storeSchema({
          schema: userSchema,
          key: 'id',
          indexMap: {
            nameIndex: { key: 'name' },
            emailIndex: { key: 'email' },
          },
        }),
      },
      1,
    );
  }

  async function createIndexOperationsDb() {
    const userSchema = ESchema.make(
      'v1',
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        email: Schema.String,
        department: Schema.String,
      }),
    ).build();

    return await createDatabase(
      testDbName,
      {
        users: storeSchema({
          schema: userSchema,
          key: 'id',
          indexMap: {
            nameIndex: { key: 'name' },
            emailIndex: { key: 'email' },
            departmentIndex: { key: 'department' },
          },
        }),
      },
      1,
    );
  }

  async function createSubscriptionsDb() {
    const userSchema = ESchema.make(
      'v1',
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
      }),
    ).build();

    return await createDatabase(
      testDbName,
      {
        users: storeSchema({
          schema: userSchema,
          key: 'id',
        }),
      },
      1,
    );
  }

  async function createErrorHandlingDb() {
    const userSchema = ESchema.make(
      'v1',
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
      }),
    ).build();

    return await createDatabase(
      testDbName,
      {
        users: storeSchema({
          schema: userSchema,
          key: 'id',
        }),
      },
      1,
    );
  }

  describe('storeSchema', () => {
    it('should create store schema with required properties', () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const schema = storeSchema({
        schema: userSchema,
        key: 'id',
        indexMap: {
          nameIndex: { key: 'name' },
        },
      });

      expect(schema.schema).toBe(userSchema);
      expect(schema.key).toBe('id');
      expect(schema.indexMap).toEqual({
        nameIndex: { key: 'name' },
      });
    });

    it('should create store schema with empty index map', () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const schema = storeSchema({
        schema: userSchema,
        key: 'id',
      });

      expect(schema.schema).toBe(userSchema);
      expect(schema.key).toBe('id');
      expect(schema.indexMap).toEqual({});
    });

    it('should handle complex index configurations', () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          email: Schema.String,
          age: Schema.Number,
        }),
      ).build();

      const schema = storeSchema({
        schema: userSchema,
        key: 'id',
        indexMap: {
          nameIndex: { key: 'name', options: { unique: false } },
          emailIndex: { key: 'email', options: { unique: true } },
          ageIndex: { key: 'age' },
        },
      });

      expect(schema.indexMap).toEqual({
        nameIndex: { key: 'name', options: { unique: false } },
        emailIndex: { key: 'email', options: { unique: true } },
        ageIndex: { key: 'age' },
      });
    });
  });

  describe('deleteDatabase', () => {
    it('should delete an existing database', async () => {
      // First create a database
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const { idbInstance } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchema,
            key: 'id',
          }),
        },
        1,
      );

      // Close the database first to avoid blocking
      idbInstance.close();

      // Now delete it
      const result = await Effect.runPromise(deleteDatabase(testDbName));
      expect(result).toBeUndefined();
    }, 10000);

    it('should handle deleting non-existent database', async () => {
      // Should not throw error when deleting non-existent database
      const result = await Effect.runPromise(deleteDatabase('non-existent-db'));
      expect(result).toBeUndefined();
    });
  });

  describe('createDatabase', () => {
    it('should create database with single store', async () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const { result, idbInstance } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchema,
            key: 'id',
          }),
        },
        1,
      );

      expect(result).toBeDefined();
      expect(result.users).toBeDefined();
      expect(idbInstance).toBeDefined();
      expect(idbInstance.name).toBe(testDbName);
      expect(idbInstance.version).toBe(1);
    });

    it('should create database with multiple stores', async () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const postSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          title: Schema.String,
          userId: Schema.String,
        }),
      ).build();

      const { result } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchema,
            key: 'id',
          }),
          posts: storeSchema({
            schema: postSchema,
            key: 'id',
            indexMap: {
              userIdIndex: { key: 'userId' },
            },
          }),
        },
        1,
      );

      expect(result.users).toBeDefined();
      expect(result.posts).toBeDefined();
    });

    it('should create database with indexes', async () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          email: Schema.String,
        }),
      ).build();

      const { result, idbInstance } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchema,
            key: 'id',
            indexMap: {
              nameIndex: { key: 'name' },
              emailIndex: { key: 'email', options: { unique: true } },
            },
          }),
        },
        1,
      );

      expect(result.users.indexes.nameIndex).toBeDefined();
      expect(result.users.indexes.emailIndex).toBeDefined();

      // Check that indexes were created in IndexedDB
      const transaction = idbInstance.transaction(['users'], 'readonly');
      const store = transaction.objectStore('users');
      expect(store.indexNames.contains('nameIndex')).toBe(true);
      expect(store.indexNames.contains('emailIndex')).toBe(true);
    });
  });

  describe('store operations', () => {
    let db: Awaited<ReturnType<typeof createStoreOperationsDb>>['result'];

    beforeEach(async () => {
      const { result } = await createStoreOperationsDb();
      db = result;
    });

    describe('addItem', () => {
      it('should add item to store', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        const result = await Effect.runPromise(db.users.addItem(user));

        expect(result.value).toEqual(user);
        expect(result.get).toBeDefined();
        expect(result.update).toBeDefined();
        expect(result.delete).toBeDefined();
      });

      it('should fail when adding duplicate key', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        // Adding same ID should fail
        const duplicate = { id: '1', name: 'Jane', email: 'jane@example.com' };
        await expect(
          Effect.runPromise(db.users.addItem(duplicate)),
        ).rejects.toThrow();
      });
    });

    describe('getItem', () => {
      it('should retrieve existing item', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        const result = await Effect.runPromise(db.users.getItem('1'));
        expect(result).toEqual(user);
      });

      it('should return undefined for non-existent item', async () => {
        const result = await Effect.runPromise(
          db.users.getItem('non-existent'),
        );
        expect(result).toBeUndefined();
      });
    });

    describe('upsertItem', () => {
      it('should insert new item', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        const result = await Effect.runPromise(db.users.upsertItem(user));

        // upsertItem returns the versioned value, so we need to check without __v
        expect(result).toEqual({ ...user, __v: 'v1' });

        const retrieved = await Effect.runPromise(db.users.getItem('1'));
        expect(retrieved).toEqual(user);
      });

      it('should update existing item', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        const updated = {
          id: '1',
          name: 'John Doe',
          email: 'johndoe@example.com',
        };
        const result = await Effect.runPromise(db.users.upsertItem(updated));

        expect(result).toEqual({ ...updated, __v: 'v1' });

        const retrieved = await Effect.runPromise(db.users.getItem('1'));
        expect(retrieved).toEqual(updated);
      });

      it('should handle silent updates', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        const updated = {
          id: '1',
          name: 'John Doe',
          email: 'johndoe@example.com',
        };
        const result = await Effect.runPromise(
          db.users.upsertItem(updated, { silent: true }),
        );

        expect(result).toEqual({ ...updated, __v: 'v1' });
      });
    });

    describe('updateItem', () => {
      it('should partially update existing item', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        await Effect.runPromise(db.users.updateItem('1', { name: 'John Doe' }));

        const result = await Effect.runPromise(db.users.getItem('1'));
        expect(result).toEqual({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
        });
      });
    });

    describe('deleteItem', () => {
      it('should delete existing item', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        await Effect.runPromise(db.users.deleteItem('1'));

        const result = await Effect.runPromise(db.users.getItem('1'));
        expect(result).toBeUndefined();
      });

      it('should not fail when deleting non-existent item', async () => {
        await Effect.runPromise(db.users.deleteItem('non-existent'));
        // Should not throw
      });
    });

    describe('getAll', () => {
      it('should return all items', async () => {
        const users = [
          { id: '1', name: 'John', email: 'john@example.com' },
          { id: '2', name: 'Jane', email: 'jane@example.com' },
          { id: '3', name: 'Bob', email: 'bob@example.com' },
        ];

        for (const user of users) {
          await Effect.runPromise(db.users.addItem(user));
        }

        const result = await Effect.runPromise(db.users.getAll);
        expect(result).toHaveLength(3);
        expect(result).toEqual(expect.arrayContaining(users));
      });

      it('should return empty array when no items', async () => {
        const result = await Effect.runPromise(db.users.getAll);
        expect(result).toEqual([]);
      });
    });

    describe('getAllKeys', () => {
      it('should return all keys', async () => {
        const users = [
          { id: '1', name: 'John', email: 'john@example.com' },
          { id: '2', name: 'Jane', email: 'jane@example.com' },
          { id: '3', name: 'Bob', email: 'bob@example.com' },
        ];

        for (const user of users) {
          await Effect.runPromise(db.users.addItem(user));
        }

        const result = await Effect.runPromise(db.users.getAllKeys);
        expect(result).toHaveLength(3);
        expect(result).toEqual(expect.arrayContaining(['1', '2', '3']));
      });

      it('should return empty array when no items', async () => {
        const result = await Effect.runPromise(db.users.getAllKeys);
        expect(result).toEqual([]);
      });
    });

    describe('key operations', () => {
      it('should provide key-based operations', async () => {
        const user = { id: '1', name: 'John', email: 'john@example.com' };
        await Effect.runPromise(db.users.addItem(user));

        const keyOps = db.users.key('1');

        // Test get
        const result = await Effect.runPromise(keyOps.get);
        expect(result).toEqual(user);

        // Test update
        await Effect.runPromise(keyOps.update({ name: 'John Doe' }));
        const updated = await Effect.runPromise(keyOps.get);
        expect(updated?.name).toBe('John Doe');

        // Test delete using the main deleteItem method instead
        await Effect.runPromise(db.users.deleteItem('1'));
        const deleted = await Effect.runPromise(keyOps.get);
        expect(deleted).toBeUndefined();
      });
    });
  });

  describe('index operations', () => {
    let db: Awaited<ReturnType<typeof createIndexOperationsDb>>['result'];

    beforeEach(async () => {
      const { result } = await createIndexOperationsDb();
      db = result;

      // Add test data
      const users = [
        {
          id: '1',
          name: 'John',
          email: 'john@example.com',
          department: 'Engineering',
        },
        {
          id: '2',
          name: 'Jane',
          email: 'jane@example.com',
          department: 'Engineering',
        },
        { id: '3', name: 'Bob', email: 'bob@example.com', department: 'Sales' },
      ];

      for (const user of users) {
        await Effect.runPromise(db.users.addItem(user));
      }
    });

    it('should query by index', async () => {
      const engineeringUsers = await Effect.runPromise(
        db.users.indexes.departmentIndex.getItems('Engineering'),
      );

      expect(engineeringUsers).toHaveLength(2);
      expect(engineeringUsers.map((u) => u.name)).toEqual(
        expect.arrayContaining(['John', 'Jane']),
      );
    });

    it('should return empty array for non-matching index query', async () => {
      const result = await Effect.runPromise(
        db.users.indexes.departmentIndex.getItems('NonExistent'),
      );

      expect(result).toEqual([]);
    });

    it('should query by unique index', async () => {
      const result = await Effect.runPromise(
        db.users.indexes.emailIndex.getItems('john@example.com'),
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
    });
  });

  describe('subscriptions', () => {
    let db: Awaited<ReturnType<typeof createSubscriptionsDb>>['result'];

    beforeEach(async () => {
      const { result } = await createSubscriptionsDb();
      db = result;
    });

    it('should subscribe to item changes', async () => {
      const changes: any[] = [];
      const unsubscribe = db.users.subscribeItem('1', (item: any) => {
        changes.push(item);
      });

      const user = { id: '1', name: 'John' };
      await Effect.runPromise(db.users.addItem(user));

      // Wait for subscription to fire
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(changes).toHaveLength(1);
      expect(changes[0]).toEqual(user);

      unsubscribe();
    });

    it('should subscribe to all keys changes', async () => {
      const keysChanges: any[] = [];
      const unsubscribe = db.users.subscribeKeys((keys: any) => {
        keysChanges.push(keys);
      });

      await Effect.runPromise(db.users.addItem({ id: '1', name: 'John' }));
      await Effect.runPromise(db.users.addItem({ id: '2', name: 'Jane' }));

      // Wait for subscriptions to fire
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(keysChanges.length).toBeGreaterThan(0);
      expect(keysChanges[keysChanges.length - 1]).toEqual(
        expect.arrayContaining(['1', '2']),
      );

      unsubscribe();
    });

    it('should subscribe to all items changes', async () => {
      const itemsChanges: any[] = [];
      const unsubscribe = db.users.subscribeAll((items: any) => {
        itemsChanges.push(items);
      });

      const user1 = { id: '1', name: 'John' };
      const user2 = { id: '2', name: 'Jane' };

      await Effect.runPromise(db.users.addItem(user1));
      await Effect.runPromise(db.users.addItem(user2));

      // Wait for subscriptions to fire
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(itemsChanges.length).toBeGreaterThan(0);
      expect(itemsChanges[itemsChanges.length - 1]).toEqual(
        expect.arrayContaining([user1, user2]),
      );

      unsubscribe();
    });

    it('should unsubscribe properly', async () => {
      const changes: any[] = [];
      const unsubscribe = db.users.subscribeItem('1', (item: any) => {
        changes.push(item);
      });

      await Effect.runPromise(db.users.addItem({ id: '1', name: 'John' }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(changes).toHaveLength(1);

      unsubscribe();

      // Add another item after unsubscribing
      await Effect.runPromise(
        db.users.upsertItem({ id: '1', name: 'John Doe' }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still be 1 because we unsubscribed
      expect(changes).toHaveLength(1);
    });
  });

  describe('schema evolution', () => {
    it('should handle evolved schemas in database operations', async () => {
      const userSchemaV1 = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      );

      const userSchemaV2 = userSchemaV1
        .evolve('v2', {
          transformSchema: (schema) =>
            Schema.extend(schema, Schema.Struct({ email: Schema.String })),
          transformValue: (old) => ({ ...old, email: 'default@example.com' }),
        })
        .build();

      const { result: db } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchemaV2,
            key: 'id',
          }),
        },
        1,
      );

      // Add a v2 item
      const userV2 = { id: '1', name: 'John', email: 'john@example.com' };
      await Effect.runPromise(db.users.addItem(userV2));

      const result = await Effect.runPromise(db.users.getItem('1'));
      expect(result).toEqual(userV2);
    });
  });

  describe('error handling', () => {
    let db: Awaited<ReturnType<typeof createErrorHandlingDb>>['result'];

    beforeEach(async () => {
      const { result } = await createErrorHandlingDb();
      db = result;
    });

    it('should handle invalid data in addItem', async () => {
      const invalidUser = { id: 123, name: 'John' }; // id should be string
      await expect(
        Effect.runPromise(db.users.addItem(invalidUser as any)),
      ).rejects.toThrow();
    });

    it('should handle invalid data in upsertItem', async () => {
      const invalidUser = { id: '1', name: 123 }; // name should be string
      await expect(
        Effect.runPromise(db.users.upsertItem(invalidUser as any)),
      ).rejects.toThrow();
    });

    it('should handle updating non-existent item', async () => {
      // updateItem should not fail, it will create the item if it doesn't exist
      await Effect.runPromise(
        db.users.updateItem('non-existent', { name: 'New Name' }),
      );

      const result = await Effect.runPromise(db.users.getItem('non-existent'));
      expect(result).toEqual({ id: 'non-existent', name: 'New Name' });
    });

    it('should handle database operation errors gracefully', async () => {
      // This test is challenging because fake-indexeddb is quite forgiving
      // Instead, let's test a scenario that would realistically cause an error

      // Try to add an item that would cause a constraint violation
      const user1 = { id: '1', name: 'John' };
      await Effect.runPromise(db.users.addItem(user1));

      // Try to add the same item again (should fail)
      await expect(
        Effect.runPromise(db.users.addItem(user1)),
      ).rejects.toThrow();
    });
  });

  describe('complex scenarios', () => {
    it('should handle large datasets', async () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
          email: Schema.String,
        }),
      ).build();

      const { result: db } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchema,
            key: 'id',
          }),
        },
        1,
      );

      // Add 100 users
      const users = Array.from({ length: 100 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
      }));

      for (const user of users) {
        await Effect.runPromise(db.users.addItem(user));
      }

      const allUsers = await Effect.runPromise(db.users.getAll);
      expect(allUsers).toHaveLength(100);

      const allKeys = await Effect.runPromise(db.users.getAllKeys);
      expect(allKeys).toHaveLength(100);
    });

    it('should handle concurrent operations', async () => {
      const userSchema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          name: Schema.String,
        }),
      ).build();

      const { result: db } = await createDatabase(
        testDbName,
        {
          users: storeSchema({
            schema: userSchema,
            key: 'id',
          }),
        },
        1,
      );

      // Perform multiple operations concurrently
      const operations = [
        db.users.addItem({ id: '1', name: 'User 1' }),
        db.users.addItem({ id: '2', name: 'User 2' }),
        db.users.addItem({ id: '3', name: 'User 3' }),
        db.users.addItem({ id: '4', name: 'User 4' }),
        db.users.addItem({ id: '5', name: 'User 5' }),
      ];

      const results = await Promise.all(
        operations.map((op) => Effect.runPromise(op)),
      );

      expect(results).toHaveLength(5);

      const allUsers = await Effect.runPromise(db.users.getAll);
      expect(allUsers).toHaveLength(5);
    });
  });
});
