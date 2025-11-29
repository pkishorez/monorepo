import { SqliteTable, SqliteEntity } from '@std-toolkit/sqlite';
import { TodoESchema } from '../domain';
import { Context, Effect } from 'effect';

export class SqliteDO extends Context.Tag('SqliteDO')<SqliteDO, SqlStorage>() {}

export class SqliteDB extends Effect.Service<SqliteDB>()('SqliteDB', {
  effect: Effect.gen(function* () {
    const sql = yield* SqliteDO;

    const table = SqliteTable.make('todos', sql)
      .index('GSI1', { pk: 'gsi1pk', sk: 'gsi1sk' })
      .build();

    const todoEntity = SqliteEntity.make(table)
      .eschema(TodoESchema)
      .primary({
        pk: {
          deps: ['userId'],
          derive: ({ userId }) => [userId, 'TODOS'],
        },
        sk: {
          deps: ['todoId'],
          derive: ({ todoId }) => [todoId],
        },
      })
      .index('GSI1', 'byUpdated', {
        pk: {
          deps: ['userId'],
          derive: ({ userId }) => [userId, 'TODOS'],
        },
        sk: {
          deps: ['_u'],
          derive: ({ _u }) => [_u],
        },
      })
      .build();

    return { todoEntity, table };
  }),
}) {}
