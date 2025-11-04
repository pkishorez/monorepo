import { createStdCollection } from '@std-toolkit/std-db-collection';
import { TodoESchema } from '../backend/domain';
import { Console, Effect } from 'effect';
import { ApiService } from './api';
import { runtime } from './runtime';

export const todoCollection = createStdCollection({
  eschema: TodoESchema,
  getKey: (v) => `${v.todoId}:${v.updatedAt}`,
  compare(a, b) {
    return a.updatedAt < b.updatedAt ? -1 : 0;
  },
  onInsert: Effect.fn(function* (todo) {
    const { client } = yield* ApiService;
    const result = yield* client.todoInsert({ todo }).pipe(Effect.orDie);
    yield* Effect.sleep(2000);

    return result;
  }, Effect.provide(runtime)),
  onUpdate: Effect.fn(function* (todo) {
    const { client } = yield* ApiService;
    if (!todo.todoId) throw new Error('TODO id is mandatory to update.');
    yield* Effect.sleep(2000);
    return yield* client
      .todoUpdate({ todoId: todo.todoId, todo })
      .pipe(Effect.orDie);
  }, Effect.provide(runtime)),

  getUpdates: Effect.fn(function* (todo) {
    const { client } = yield* ApiService;
    console.log('calling', client);
    const results = yield* client
      .todoQuery({ updatedAt: todo?.updatedAt })
      .pipe(Effect.onExit(Console.log), Effect.orDie);
    console.log('RESULT???', results);

    return results;
  }, Effect.provide(runtime)),
});
