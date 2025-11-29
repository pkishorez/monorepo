import { createStdCollection } from '@std-toolkit/std-db-collection';
import { IDbSource } from '@std-toolkit/std-db-collection/source';
import { IDBStore } from '@std-toolkit/idb';
import { TodoESchema } from '../backend/domain';
import { Effect } from 'effect';
import { runtime } from './runtime';
import { WebSocketService } from './websocket';

const store = await Effect.runPromise(
  Effect.runSync(
    Effect.cached(
      Effect.promise(async () => {
        return typeof indexedDB !== 'undefined'
          ? await IDBStore.make('source')
          : undefined;
      }),
    ),
  ),
);
export const todoCollection = createStdCollection({
  schema: TodoESchema,
  source: store
    ? new IDbSource<(typeof TodoESchema)['Type']>('todos', store)
    : undefined,
  onInsert: Effect.fn(function* (todo) {
    const { socketClient } = yield* WebSocketService;
    return yield* socketClient.todoInsert({ todo }).pipe(Effect.orDie);
  }, Effect.provide(runtime)),
  onUpdate: Effect.fn(function* (key, todo) {
    const { socketClient } = yield* WebSocketService;
    return yield* socketClient
      .todoUpdate({ todoId: key.todoId, todo })
      .pipe(Effect.orDie);
  }, Effect.provide(runtime)),
  sync: Effect.fn(
    function* (todoRef) {
      console.log('SUBSCRIBE');
      const { socketClient } = yield* WebSocketService;
      const todo = yield* todoRef.get;
      yield* socketClient
        .subscribeQuery({ updatedAt: todo?._u })
        .pipe(Effect.orDie);
      yield* Effect.never;
    },
    Effect.provide(runtime),
    Effect.ensuring(
      Effect.gen(function* () {
        console.log('UNSBSCRIBING>>>');
        const { socketClient } = yield* WebSocketService;
        yield* socketClient.unsubscribeQuery();
      }).pipe(Effect.orDie, Effect.provide(runtime)),
    ),
  ),
});
