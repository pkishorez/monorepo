import { Deferred, Effect, Fiber, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import { SqliteDB, SqliteDBError } from '../../sql/db.js';
import { SQLiteTable } from '../sqlite-table.js';

const ItemSchema = EntityESchema.make('Item', 'itemId', {
  value: Schema.Number,
}).build();

const makeDbLayer = (overrides: Record<string, unknown>) =>
  Layer.succeed(SqliteDB, {
    tableName: 'items',
    createTable: () => Effect.void,
    addColumn: () => Effect.void,
    createIndex: () => Effect.void,
    insert: () => Effect.succeed({ rowsWritten: 1 }),
    update: () => Effect.succeed({ rowsWritten: 1 }),
    delete: () => Effect.succeed({ rowsDeleted: 0 }),
    deleteAll: () => Effect.succeed({ rowsDeleted: 0 }),
    get: () => Effect.die('unused'),
    query: () => Effect.succeed([]),
    begin: () => Effect.void,
    commit: () => Effect.void,
    rollback: () => Effect.void,
    ...overrides,
  } as any);

describe('SQLite', () => {
  describe('Transactions', () => {
    describe('Safety', () => {
      it('fails restore when the row changed after it was read', async () => {
        const table = SQLiteTable.make().primary('pk', 'sk').build();
        const entity = table.entity(ItemSchema).primary().build();
        let updateWhere: { clause: string; params: unknown[] } | undefined;
        const staleRow = {
          pk: 'Item',
          sk: 'item-1',
          _data: JSON.stringify({ itemId: 'item-1', value: 1, _v: 'v1' }),
          _e: 'Item',
          _v: 'v1',
          _u: 'old-u',
          _d: 1,
        };

        const error = await Effect.runPromise(
          entity.restore({ itemId: 'item-1' }).pipe(
            Effect.provide(
              makeDbLayer({
                query: () => Effect.succeed([staleRow]),
                update: (
                  _table: string,
                  _values: unknown,
                  where: typeof updateWhere,
                ) =>
                  Effect.sync(() => {
                    updateWhere = where;
                    return { rowsWritten: 0 };
                  }),
              }),
            ),
            Effect.flip,
          ),
        );

        expect(error.error._tag).toBe('ConditionFailed');
        expect(updateWhere?.clause).toContain('_u = ?');
        expect(updateWhere?.params).toContain('old-u');
      });

      it('preserves commit failures and attempts rollback cleanup', async () => {
        const table = SQLiteTable.make().primary('pk', 'sk').build();
        const entity = table.entity(ItemSchema).primary().build();
        let rollbacks = 0;
        const commitError = SqliteDBError.commitFailed('commit failed');

        const error = await Effect.runPromise(
          Effect.gen(function* () {
            const op = yield* entity.insertOp({ itemId: 'item-1', value: 1 });
            return yield* table.transact([op]);
          }).pipe(
            Effect.provide(
              makeDbLayer({
                commit: () => Effect.fail(commitError),
                rollback: () =>
                  Effect.sync(() => {
                    rollbacks += 1;
                  }),
              }),
            ),
            Effect.flip,
          ),
        );

        expect(error).toBe(commitError);
        expect(rollbacks).toBe(1);
      });

      it('rolls back when interrupted during a transaction write', async () => {
        const table = SQLiteTable.make().primary('pk', 'sk').build();
        const entity = table.entity(ItemSchema).primary().build();
        let rollbacks = 0;

        await Effect.runPromise(
          Effect.gen(function* () {
            const began = yield* Deferred.make<void>();
            const op = yield* entity.insertOp({ itemId: 'item-1', value: 1 });
            const fiber = yield* table.transact([op]).pipe(
              Effect.provide(
                makeDbLayer({
                  begin: () => Deferred.succeed(began, undefined),
                  insert: () => Effect.never,
                  rollback: () =>
                    Effect.sync(() => {
                      rollbacks += 1;
                    }),
                }),
              ),
              Effect.forkChild,
            );

            yield* Deferred.await(began);
            yield* Fiber.interrupt(fiber);
          }).pipe(Effect.provide(makeDbLayer({}))),
        );

        expect(rollbacks).toBe(1);
      });
    });
  });
});
