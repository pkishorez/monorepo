import { todoEntity } from './db';
import { Console, Effect } from 'effect';
import { TodoError, TodosRpc } from './domain';
import { ulid } from 'ulid';

export const TodosRpcLive = TodosRpc.toLayer(
  Effect.succeed({
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
          .pipe(Effect.mapError((err) => new TodoError({ type: err._tag })));

        return item;
      }),
    todoUpdate: ({ todoId, todo }) =>
      Effect.gen(function* () {
        const { item } = yield* todoEntity
          .update(
            { todoId, userId: 'test' },
            { ...todo, updatedAt: new Date().toISOString() },
          )
          .pipe(Effect.mapError((err) => new TodoError({ type: err._tag })));

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
          .index('byUpdated')
          .query({
            pk: { userId: 'test' },
            sk: {
              '>': updatedAt ? { updatedAt } : null,
            },
          })
          .pipe(
            Effect.tapError(Console.error),
            Effect.map((v) => v.items.map((item) => item.value)),
            Effect.mapError(() => new TodoError({})),
          );

        return todos;
      }),
  }),
);
