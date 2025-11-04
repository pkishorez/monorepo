import { todoEntity } from './db';
import { Console, Effect } from 'effect';
import { TodoError, TodosRpc } from './domain';
import { ulid } from 'ulid';

export const TodosRpcLive = TodosRpc.toLayer(
  Effect.succeed({
    todoInsert: ({ todo }) =>
      Effect.gen(function* () {
        const todoId = ulid();
        yield* todoEntity
          .insert({ ...todo, userId: 'test', todoId }, { debug: true })
          .pipe(Effect.mapError((err) => new TodoError({ type: err._tag })));

        return { ...todo, todoId };
      }),
    todoUpdate: ({ todoId, todo }) =>
      Effect.gen(function* () {
        yield* todoEntity
          .update({ todoId, userId: 'test' }, todo)
          .pipe(Effect.mapError((err) => new TodoError({ type: err._tag })));

        return todo;
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
          .query(
            {
              pk: { userId: 'test' },
              sk: {
                '>': updatedAt ? { updatedAt } : null,
              },
            },
            { debug: true },
          )
          .pipe(
            Effect.tapError(Console.error),
            Effect.map((v) => v.items.map((item) => item.value)),
            Effect.mapError(() => new TodoError({})),
          );

        return todos;
      }),
  }),
);
