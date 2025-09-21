import { ESchema } from '@monorepo/eschema';
import { Effect, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { DynamoEntity } from '../src/entity/entity.js';
import { cleanTable, table } from './setup.js';

describe('entity Secondary Index Derivation', () => {
  beforeEach(async () => {
    await cleanTable();
  });

  describe('automatic secondary index key derivation', () => {
    it('should automatically derive secondary index keys on put operation', async () => {
      const eschema = ESchema.make(
        'v1',
        Schema.Struct({
          userId: Schema.String,
          email: Schema.String,
          status: Schema.Literal('ACTIVE', 'INACTIVE'),
          type: Schema.String,
        }),
      ).build();

      const entity = DynamoEntity.make({ eschema, table })
        .primary({
          pk: {
            deps: [],
            derive: () => ['USER'],
          },
          sk: {
            deps: ['userId'],
            derive: ({ userId }) => ['USER', userId],
          },
        })
        .index('GSI1', {
          pk: {
            deps: ['status'],
            derive: ({ status }) => ['STATUS', status],
          },
          sk: {
            deps: ['userId', 'type'],
            derive: ({ userId, type }) => [type, userId],
          },
        })
        .index('GSI2', {
          pk: {
            deps: ['email'],
            derive: ({ email }) => ['EMAIL', email],
          },
          sk: {
            deps: ['userId'],
            derive: ({ userId }) => [userId],
          },
        })
        .build();

      const item = eschema.make({
        userId: 'test-user-1',
        email: 'test@example.com',
        status: 'ACTIVE',
        type: 'PREMIUM',
      });

      await Effect.runPromise(entity.put(item));

      // Query with onExcessProperty: 'preserve' to inspect all fields
      const result = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      expect(result.Items).toHaveLength(1);
      const storedItem = result.Items[0] as any;

      // Verify primary keys
      expect(storedItem.pkey).toBe('USER');
      expect(storedItem.skey).toBe('USER#test-user-1');

      // Verify GSI1 keys were automatically derived
      expect(storedItem.gsi1pk).toBe('STATUS#ACTIVE');
      expect(storedItem.gsi1sk).toBe('PREMIUM#test-user-1');

      // Verify GSI2 keys were automatically derived
      expect(storedItem.gsi2pk).toBe('EMAIL#test@example.com');
      expect(storedItem.gsi2sk).toBe('test-user-1');
    });

    it('should automatically update secondary index keys when dependencies change', async () => {
      const eschema = ESchema.make(
        'v1',
        Schema.Struct({
          userId: Schema.String,
          email: Schema.String,
          status: Schema.Literal('ACTIVE', 'INACTIVE', 'DELETED'),
          department: Schema.String,
        }),
      ).build();

      const entity = DynamoEntity.make({ eschema, table })
        .primary({
          pk: {
            deps: [],
            derive: () => ['USER'],
          },
          sk: {
            deps: ['userId'],
            derive: ({ userId }) => ['USER', userId],
          },
        })
        .index('GSI1', {
          pk: {
            deps: ['department'],
            derive: ({ department }) => ['DEPT', department],
          },
          sk: {
            deps: ['status', 'userId'],
            derive: ({ status, userId }) => [status, userId],
          },
        })
        .build();

      // Initial item
      const item = eschema.make({
        userId: 'emp-001',
        email: 'emp001@corp.com',
        status: 'ACTIVE',
        department: 'ENGINEERING',
      });

      await Effect.runPromise(entity.put(item));

      // Update status and department - should trigger secondary index updates
      await Effect.runPromise(
        entity.update(
          { userId: 'emp-001' },
          { status: 'INACTIVE', department: 'PRODUCT' },
          { ignoreVersionMismatch: true },
        ),
      );

      // Query to verify the updates
      const result = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const updatedItem = result.Items[0] as any;

      // Verify GSI1 keys were automatically updated based on new values
      expect(updatedItem.gsi1pk).toBe('DEPT#PRODUCT');
      expect(updatedItem.gsi1sk).toBe('INACTIVE#emp-001');
      expect(updatedItem.status).toBe('INACTIVE');
      expect(updatedItem.department).toBe('PRODUCT');
    });

    it('should only update secondary indexes when ALL their dependencies are included', async () => {
      const eschema = ESchema.make(
        'v1',
        Schema.Struct({
          userId: Schema.String,
          name: Schema.String,
          email: Schema.String,
          status: Schema.Literal('ACTIVE', 'INACTIVE'),
          level: Schema.Number,
        }),
      ).build();

      const entity = DynamoEntity.make({ eschema, table })
        .primary({
          pk: {
            deps: [],
            derive: () => ['USER'],
          },
          sk: {
            deps: ['userId'],
            derive: ({ userId }) => ['USER', userId],
          },
        })
        .index('GSI1', {
          pk: {
            deps: ['status', 'level'],
            derive: ({ status, level }) => [status, `L${level}`],
          },
          sk: {
            deps: ['userId'],
            derive: ({ userId }) => [userId],
          },
        })
        .index('GSI2', {
          pk: {
            deps: ['email'],
            derive: ({ email }) => ['EMAIL', email],
          },
          sk: {
            deps: ['name'],
            derive: ({ name }) => [name.toUpperCase()],
          },
        })
        .build();

      const item = eschema.make({
        userId: 'user-partial-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
        status: 'ACTIVE',
        level: 3,
      });

      await Effect.runPromise(entity.put(item));

      // Update only email and name - should update GSI2 (all deps present) but not GSI1 (missing deps)
      await Effect.runPromise(
        entity.update(
          { userId: 'user-partial-1' },
          { email: 'alice.smith@example.com', name: 'Alice Johnson' },
          { ignoreVersionMismatch: true },
        ),
      );

      const afterPartialUpdate = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const partiallyUpdated = afterPartialUpdate.Items[0] as any;

      // GSI1 should remain unchanged (not all dependencies in update)
      expect(partiallyUpdated.gsi1pk).toBe('ACTIVE#L3');
      expect(partiallyUpdated.gsi1sk).toBe('user-partial-1');

      // GSI2 should be updated (all dependencies for each key included)
      expect(partiallyUpdated.gsi2pk).toBe('EMAIL#alice.smith@example.com');
      expect(partiallyUpdated.gsi2sk).toBe('ALICE JOHNSON');

      // Update only status - GSI1 pk should NOT update (needs both status AND level)
      await Effect.runPromise(
        entity.update(
          { userId: 'user-partial-1' },
          { status: 'INACTIVE' },
          { ignoreVersionMismatch: true },
        ),
      );

      const afterStatusUpdate = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const statusUpdated = afterStatusUpdate.Items[0] as any;

      // GSI1 pk should remain unchanged (only status provided, but level also needed)
      expect(statusUpdated.gsi1pk).toBe('ACTIVE#L3');
      expect(statusUpdated.gsi1sk).toBe('user-partial-1');

      // Update both status and level - NOW GSI1 should update
      await Effect.runPromise(
        entity.update(
          { userId: 'user-partial-1' },
          { status: 'INACTIVE', level: 5 },
          { ignoreVersionMismatch: true },
        ),
      );

      const afterFullUpdate = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const fullyUpdated = afterFullUpdate.Items[0] as any;

      // GSI1 should now be updated (both deps provided)
      expect(fullyUpdated.gsi1pk).toBe('INACTIVE#L5');
      expect(fullyUpdated.gsi1sk).toBe('user-partial-1');
    });

    it('should handle complex derivation functions correctly', async () => {
      const eschema = ESchema.make(
        'v1',
        Schema.Struct({
          orderId: Schema.String,
          customerId: Schema.String,
          orderDate: Schema.String,
          status: Schema.Literal('PENDING', 'SHIPPED', 'DELIVERED'),
          priority: Schema.Number,
        }),
      ).build();

      const entity = DynamoEntity.make({ eschema, table })
        .primary({
          pk: {
            deps: [],
            derive: () => ['ORDER'],
          },
          sk: {
            deps: ['orderId'],
            derive: ({ orderId }) => ['ORDER', orderId],
          },
        })
        .index('GSI1', {
          pk: {
            deps: ['customerId'],
            derive: ({ customerId }) => ['CUSTOMER', customerId],
          },
          sk: {
            deps: ['orderDate', 'orderId'],
            derive: ({ orderDate, orderId }) => [orderDate, orderId],
          },
        })
        .index('GSI2', {
          pk: {
            deps: ['status', 'priority'],
            derive: ({ status, priority }) => {
              const priorityLabel = priority >= 3 ? 'HIGH' : 'NORMAL';
              return [status, priorityLabel];
            },
          },
          sk: {
            deps: ['orderDate', 'orderId'],
            derive: ({ orderDate, orderId }) => [orderDate, orderId],
          },
        })
        .build();

      const order = eschema.make({
        orderId: 'ORD-2024-001',
        customerId: 'CUST-123',
        orderDate: '2024-01-15',
        status: 'PENDING',
        priority: 5,
      });

      await Effect.runPromise(entity.put(order));

      // Initial verification
      const initialResult = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );
      const initialItem = initialResult.Items[0] as any;

      expect(initialItem.gsi1pk).toBe('CUSTOMER#CUST-123');
      expect(initialItem.gsi1sk).toBe('2024-01-15#ORD-2024-001');
      expect(initialItem.gsi2pk).toBe('PENDING#HIGH');
      expect(initialItem.gsi2sk).toBe('2024-01-15#ORD-2024-001');

      // Update status and priority
      await Effect.runPromise(
        entity.update(
          { orderId: 'ORD-2024-001' },
          { status: 'SHIPPED', priority: 1 },
          { ignoreVersionMismatch: true },
        ),
      );

      const updatedResult = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );
      const updatedItem = updatedResult.Items[0] as any;

      // GSI2 should reflect the complex derivation with new values
      expect(updatedItem.gsi2pk).toBe('SHIPPED#NORMAL');
    });

    it('should update single-dependency indexes when that dependency changes', async () => {
      const eschema = ESchema.make(
        'v1',
        Schema.Struct({
          userId: Schema.String,
          category: Schema.String,
          subcategory: Schema.String,
          region: Schema.String,
        }),
      ).build();

      const entity = DynamoEntity.make({ eschema, table })
        .primary({
          pk: {
            deps: [],
            derive: () => ['ITEM'],
          },
          sk: {
            deps: ['userId'],
            derive: ({ userId }) => [userId],
          },
        })
        .index('GSI1', {
          pk: {
            deps: ['category'],  // Single dependency
            derive: ({ category }) => ['CAT', category],
          },
          sk: {
            deps: ['subcategory', 'region'],  // Multiple dependencies (not including primary key)
            derive: ({ subcategory, region }) => [subcategory, region],
          },
        })
        .build();

      await Effect.runPromise(
        entity.put(
          eschema.make({
            userId: 'single-dep-test',
            category: 'ELECTRONICS',
            subcategory: 'PHONES',
            region: 'US-WEST',
          }),
        ),
      );

      // Update only category - GSI1 pk should update (single dep present)
      // GSI1 sk should NOT update (not all deps present)
      await Effect.runPromise(
        entity.update(
          { userId: 'single-dep-test' },
          { category: 'FURNITURE' },
          { ignoreVersionMismatch: true },
        ),
      );

      const afterCategoryUpdate = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const updated = afterCategoryUpdate.Items[0] as any;

      // GSI1 pk should update (single dependency provided)
      expect(updated.gsi1pk).toBe('CAT#FURNITURE');
      // GSI1 sk should remain unchanged (not all dependencies provided)
      expect(updated.gsi1sk).toBe('PHONES#US-WEST');

      // Update only subcategory - GSI1 sk should NOT update (missing region)
      await Effect.runPromise(
        entity.update(
          { userId: 'single-dep-test' },
          { subcategory: 'TABLES' },
          { ignoreVersionMismatch: true },
        ),
      );

      const afterSubcategoryUpdate = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const stillPartial = afterSubcategoryUpdate.Items[0] as any;

      // GSI1 sk should still be unchanged (region not in the update)
      expect(stillPartial.gsi1sk).toBe('PHONES#US-WEST');
      // But subcategory field should be updated
      expect(stillPartial.subcategory).toBe('TABLES');

      // Update both subcategory and region - GSI1 sk should now update
      await Effect.runPromise(
        entity.update(
          { userId: 'single-dep-test' },
          { subcategory: 'DESKS', region: 'EU-CENTRAL' },
          { ignoreVersionMismatch: true },
        ),
      );

      const afterFullUpdate = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );

      const fullyUpdated = afterFullUpdate.Items[0] as any;

      // GSI1 sk should now be updated (all dependencies provided)
      expect(fullyUpdated.gsi1sk).toBe('DESKS#EU-CENTRAL');
    });

    it('should handle indexes with no dependencies correctly', async () => {
      const eschema = ESchema.make(
        'v1',
        Schema.Struct({
          id: Schema.String,
          data: Schema.String,
        }),
      ).build();

      const entity = DynamoEntity.make({ eschema, table })
        .primary({
          pk: {
            deps: [],
            derive: () => ['STATIC_PK'],
          },
          sk: {
            deps: ['id'],
            derive: ({ id }) => [id],
          },
        })
        .index('GSI1', {
          pk: {
            deps: [],
            derive: () => ['ALL_ITEMS'],
          },
          sk: {
            deps: [],
            derive: () => [new Date().toISOString()],
          },
        })
        .build();

      await Effect.runPromise(
        entity.put(eschema.make({ id: 'test-1', data: 'initial' })),
      );

      const result = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );
      const item = result.Items[0] as any;

      // Static derivations should always be set
      expect(item.gsi1pk).toBe('ALL_ITEMS');
      expect(item.gsi1sk).toBeDefined();
      expect(item.gsi1sk).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date pattern

      // Update should regenerate the no-dependency keys
      await Effect.runPromise(
        entity.update({ id: 'test-1' }, { data: 'updated' }, { ignoreVersionMismatch: true }),
      );

      const updated = await Effect.runPromise(
        entity.query({ pk: {} }, { onExcessProperty: 'preserve' }),
      );
      const updatedItem = updated.Items[0] as any;

      expect(updatedItem.gsi1pk).toBe('ALL_ITEMS');
      expect(updatedItem.gsi1sk).toBeDefined(); // Should have a new timestamp
    });
  });
});