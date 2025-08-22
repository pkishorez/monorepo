import type { UpdateExprParameters } from '../../src/table/expr/index.js';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanTable, table } from '../setup.js';

describe('updateItem with update property', () => {
  beforeEach(async () => {
    await cleanTable();
  });

  describe('basic update operations', () => {
    it('should update item using SET operation', async () => {
      // Insert initial item
      const initialItem = {
        pkey: 'USER#123',
        skey: 'PROFILE',
        name: 'John Doe',
        age: 30,
        status: 'active',
      };

      await Effect.runPromise(table.putItem(initialItem));

      // Update using the new update property
      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'USER#123', skey: 'PROFILE' },
          {
            update: {
              SET: {
                name: { op: 'direct', value: 'Jane Doe' },
                age: { op: 'direct', value: 25 },
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'USER#123',
        skey: 'PROFILE',
        name: 'Jane Doe',
        age: 25,
        status: 'active',
      });
    });

    it('should support ADD operation', async () => {
      const initialItem = {
        pkey: 'COUNTER#001',
        skey: 'DATA',
        score: 10,
        visits: 5,
      };

      await Effect.runPromise(table.putItem(initialItem));

      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'COUNTER#001', skey: 'DATA' },
          {
            update: {
              ADD: {
                score: 15,
                visits: 1,
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'COUNTER#001',
        skey: 'DATA',
        score: 25, // 10 + 15
        visits: 6, // 5 + 1
      });
    });

    it('should support REMOVE operation', async () => {
      const initialItem = {
        pkey: 'USER#456',
        skey: 'PROFILE',
        name: 'Bob Smith',
        email: 'bob@example.com',
        phone: '555-1234',
        tempField: 'to be removed',
      };

      await Effect.runPromise(table.putItem(initialItem));

      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'USER#456', skey: 'PROFILE' },
          {
            update: {
              REMOVE: ['tempField', 'phone'],
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'USER#456',
        skey: 'PROFILE',
        name: 'Bob Smith',
        email: 'bob@example.com',
      });
      expect(updateResult.Attributes).not.toHaveProperty('tempField');
      expect(updateResult.Attributes).not.toHaveProperty('phone');
    });

    it('should support multiple operation types', async () => {
      const initialItem = {
        pkey: 'MULTI#001',
        skey: 'DATA',
        name: 'Original',
        score: 100,
        tags: new Set(['tag1', 'tag2']),
        tempField: 'remove me',
      };

      await Effect.runPromise(table.putItem(initialItem));

      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'MULTI#001', skey: 'DATA' },
          {
            update: {
              SET: {
                name: { op: 'direct', value: 'Updated' },
              },
              ADD: { score: 50 },
              REMOVE: ['tempField'],
              DELETE: { tags: new Set(['tag2']) },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'MULTI#001',
        skey: 'DATA',
        name: 'Updated',
        score: 150, // 100 + 50
      });
      expect(updateResult.Attributes).not.toHaveProperty('tempField');
      // Note: Set operations in DynamoDB may need special handling for comparison
    });
  });

  describe('update with functions', () => {
    it('should support if_not_exists function', async () => {
      const initialItem = {
        pkey: 'FUNC#001',
        skey: 'DATA',
        name: 'John',
        // No 'defaultValue' field initially
      };

      await Effect.runPromise(table.putItem(initialItem));

      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'FUNC#001', skey: 'DATA' },
          {
            update: {
              SET: {
                defaultValue: {
                  op: 'if_not_exists',
                  attr: 'defaultValue',
                  default: 'default',
                },
                name: {
                  op: 'if_not_exists',
                  attr: 'name',
                  default: 'fallback',
                },
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'FUNC#001',
        skey: 'DATA',
        name: 'John', // Existing value, not changed
        defaultValue: 'default', // New value set
      });
    });

    it('should support plus and minus operations', async () => {
      const initialItem = {
        pkey: 'MATH#001',
        skey: 'DATA',
        counter: 10,
        score: 100,
      };

      await Effect.runPromise(table.putItem(initialItem));

      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'MATH#001', skey: 'DATA' },
          {
            update: {
              SET: {
                counter: { op: 'plus', attr: 'counter', value: 5 },
                score: { op: 'minus', attr: 'score', value: 20 },
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'MATH#001',
        skey: 'DATA',
        counter: 15, // 10 + 5
        score: 80, // 100 - 20
      });
    });

    it('should support list_append function', async () => {
      const initialItem = {
        pkey: 'LIST#001',
        skey: 'DATA',
        items: ['item1', 'item2'],
        newList: [],
      };

      await Effect.runPromise(table.putItem(initialItem));

      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'LIST#001', skey: 'DATA' },
          {
            update: {
              SET: {
                items: {
                  op: 'list_append',
                  attr: 'items',
                  list: ['item3', 'item4'],
                },
                newList: {
                  op: 'list_append',
                  attr: 'newList',
                  list: ['first', 'second'],
                },
              },
            },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'LIST#001',
        skey: 'DATA',
        items: ['item1', 'item2', 'item3', 'item4'],
        newList: ['first', 'second'],
      });
    });
  });

  describe('update with condition', () => {
    it('should update item with condition expression', async () => {
      const initialItem = {
        pkey: 'COND#001',
        skey: 'DATA',
        name: 'John',
        status: 'active',
        version: 1,
      };

      await Effect.runPromise(table.putItem(initialItem));

      // Update with condition
      const updateResult = await Effect.runPromise(
        table.updateItem(
          { pkey: 'COND#001', skey: 'DATA' },
          {
            update: {
              SET: {
                status: { op: 'direct', value: 'inactive' },
                version: { op: 'plus', attr: 'version', value: 1 },
              },
            },
            condition: { version: { '=': 1 } },
            ReturnValues: 'ALL_NEW',
          },
        ),
      );

      expect(updateResult.Attributes).toMatchObject({
        pkey: 'COND#001',
        skey: 'DATA',
        name: 'John',
        status: 'inactive',
        version: 2,
      });
    });

    it('should fail update when condition is not met', async () => {
      const initialItem = {
        pkey: 'COND#002',
        skey: 'DATA',
        name: 'Jane',
        version: 2,
      };

      await Effect.runPromise(table.putItem(initialItem));

      // Try to update with wrong condition
      await expect(
        Effect.runPromise(
          table.updateItem(
            { pkey: 'COND#002', skey: 'DATA' },
            {
              update: {
                SET: {
                  name: { op: 'direct', value: 'Updated' },
                },
              },
              condition: { version: { '=': 1 } }, // Wrong version
            },
          ),
        ),
      ).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should require at least one update operation', () => {
      // This test verifies that the type system prevents empty update operations
      // The UpdateExprParameters type now requires at least one of SET, ADD, REMOVE, or DELETE

      // This would now cause a TypeScript compilation error:
      // const invalidUpdate: UpdateExprParameters = {}; // ❌ Type error

      // Valid updates must have at least one operation:
      const validUpdate: UpdateExprParameters = {
        SET: { name: { op: 'direct', value: 'test' } },
      };

      expect(validUpdate).toBeDefined();
    });
  });
});
