import { Console, Effect } from 'effect';
import { TodoError, TodosRpc } from '../domain';
import { ulid } from 'ulid';
import { SqliteDB } from './db';

export const TodosRpcLive = TodosRpc.toLayer(
  Effect.gen(function* () {
    const { todoEntity } = yield* SqliteDB;

    return {
      todoInsert: ({ todo }) =>
        Effect.gen(function* () {
          const todoId = ulid();
          const { item } = yield* todoEntity
            .insert({
              ...todo,
              userId: 'test',
              todoId,
              updatedAt: new Date().toISOString(),
            })
            .pipe(
              Effect.mapError(
                (err) => new TodoError({ type: err?._tag, info: err }),
              ),
            );

          return item;
        }),
      todoUpdate: ({ todoId, todo }) =>
        Effect.gen(function* () {
          const { item } = yield* todoEntity
            .update(
              { todoId, userId: 'test' },
              { ...todo, updatedAt: new Date().toISOString() },
              { debug: true },
            )
            .pipe(Effect.mapError((err) => new TodoError({ info: err })));

          return item;
        }),
      // todoStream: ({ gt }) =>
      //   Effect.gen(function* () {
      //     const todos = yield* todoEntity
      //       .index('byUpdated')
      //       .query({
      //         pk: { userId: 'test' },
      //         sk: {
      //           '>': { updatedAt: gt ?? '' },
      //         },
      //       })
      //       .pipe(
      //         Effect.map((v) => v.items.map((item) => item.value)),
      //         Effect.mapError(() => new TodoError({})),
      //       );
      //
      //     return todos;
      //   }),
      todoQuery: ({ updatedAt }) =>
        Effect.gen(function* () {
          const todos = yield* todoEntity
            .index('byUpdated', { debug: true })
            .query({
              pk: { userId: 'test' },
              sk: {
                '>': updatedAt ? { updatedAt } : null,
              },
            })
            .pipe(
              Effect.map((v) => v.items.map((item) => item)),
              Effect.mapError(() => new TodoError({})),
            );

          console.log('TODOS: ', todos);

          return todos.map((v) => v.value);
        }),
    };
  }),
);
