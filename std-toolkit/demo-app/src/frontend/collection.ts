import { createStdCollection } from '@std-toolkit/std-db-collection';
import { TodoESchema } from '../backend/domain';
import { Console, Effect } from 'effect';
import { ApiService } from './api';
import { runtime } from './runtime';

export const todoCollection = createStdCollection({
  eschema: TodoESchema,
  keyConfig: {
    deps: ['todoId'],
    encode: ({ todoId }) => todoId,
    decode: (todoId) => ({ todoId }),
  },
  onInsert: Effect.fn(function* (todo) {
    const { client } = yield* ApiService;
    const result = yield* client.todoInsert({ todo }).pipe(Effect.orDie);

    return result;
  }, Effect.provide(runtime)),
  onUpdate: Effect.fn(function* (key, todo) {
    const { client } = yield* ApiService;
    return yield* client
      .todoUpdate({ todoId: key.todoId, todo })
      .pipe(Effect.orDie);
  }, Effect.provide(runtime)),

  getUpdates: Effect.fn(function* (todo) {
    const { client } = yield* ApiService;
    const results = yield* client
      .todoQuery({ updatedAt: todo?.updatedAt })
      .pipe(Effect.onExit(Console.log), Effect.orDie);

    return results;
  }, Effect.provide(runtime)),
});
