import { todoEntity } from './db';
import { Console, Effect, Schedule, Stream } from 'effect';
import { TodoError, TodosRpc } from '../domain';
import { ulid } from 'ulid';

export const TodosRpcLive = TodosRpc.toLayer(
  Effect.succeed({
    todoInsert: ({ todo }) =>
      Effect.gen(function* () {
        const todoId = ulid();
        const { item } = yield* todoEntity
          .insert(
            {
              ...todo,
              userId: 'test',
              todoId,
            },
            { debug: false },
          )
          .pipe(Effect.mapError((err) => new TodoError({ type: err._tag })));

        return item;
      }),
    todoUpdate: ({ todoId, todo }) =>
      Effect.gen(function* () {
        const { item } = yield* todoEntity
          .update({ todoId, userId: 'test' }, todo, { debug: false })
          .pipe(Effect.mapError((err) => new TodoError({ type: err._tag })));

        return item;
      }),
    subscribeQuery: ({ updatedAt }) =>
      todoEntity
        .index('byUpdated')
        .query(
          {
            pk: { userId: 'test' },
            sk: {
              '>': updatedAt ? { _u: updatedAt } : null,
            },
          },
          { debug: false },
        )
        .pipe(
          Effect.withSpan('todoQuery', {
            captureStackTrace: true,
            attributes: {
              'todo.updatedAt': updatedAt,
            },
          }),
          Effect.onError(Effect.logError),
          Effect.map((v) => v.items),
          Effect.mapError(() => new TodoError({})),
          Stream.fromIterableEffect,
          Stream.schedule(Schedule.spaced(300)),
        ),
    todoQuery: ({ updatedAt }) =>
      Effect.gen(function* () {
        const todos = yield* todoEntity
          .index('byUpdated')
          .query({
            pk: { userId: 'test' },
            sk: {
              '>': updatedAt ? { _u: updatedAt } : null,
            },
          })
          .pipe(
            Effect.tapError(Console.error),
            Effect.map((v) => v.items),
            Effect.mapError(() => new TodoError({})),
          );

        return todos;
      }),
  }),
);
