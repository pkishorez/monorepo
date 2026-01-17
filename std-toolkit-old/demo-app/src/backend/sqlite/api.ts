import { Chunk, Effect, Option, Stream } from 'effect';
import { TodoError, TodosRpc } from '../domain';
import { ulid } from 'ulid';
import { SqliteDB } from './db';
import { BroadcastService } from '@std-toolkit/core/broadcast.js';
import {
  ConnectionService,
  stringifyObj,
} from '@std-toolkit/core/connection.js';
import { JobScheduler } from '@kishorez/effect-cf/job.js';

const userId = 'test';
export const TodosRpcLive = TodosRpc.toLayer(
  Effect.gen(function* () {
    const { todoEntity } = yield* SqliteDB;
    const id = { meta: { _e: todoEntity.name } };

    return {
      todoInsert: ({ todo }) =>
        Effect.gen(function* () {
          const todoId = ulid();
          const item = yield* todoEntity
            .insert({
              ...todo,
              userId,
              todoId,
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
          const item = yield* todoEntity
            .update({ todoId, userId }, todo, { debug: false })
            .pipe(Effect.mapError((err) => new TodoError({ info: err })));

          return item;
        }),
      subscribeQuery: ({ updatedAt }) =>
        Effect.gen(function* () {
          const scheduler = yield* (yield* Effect.serviceOption(
            JobScheduler,
          )).pipe(Effect.orDie);
          const broadcastService = yield* (yield* Effect.serviceOption(
            BroadcastService,
          )).pipe(Effect.orDie);
          const connection = yield* (yield* Effect.serviceOption(
            ConnectionService,
          )).pipe(Effect.orDie);

          yield* scheduler.subscribe(
            stringifyObj(id),

            Stream.paginateChunkEffect(updatedAt ?? null, (next) =>
              Effect.gen(function* () {
                const result = Chunk.fromIterable(
                  yield* todoEntity
                    .index('byUpdated')
                    .query(
                      {
                        pk: { userId },
                        sk: {
                          '>': next ? { _u: next } : null,
                        },
                      },
                      { limit: 10, debug: false },
                    )
                    .pipe(
                      Effect.onError(Effect.logError),
                      Effect.map((v) => v.items),
                      Effect.tap((v) => {
                        v.forEach((item) => {
                          broadcastService.broadcast({
                            value: item,
                            to: 'self',
                            connectionIds: [connection.connectionId],
                          });
                        });
                      }),
                      Effect.mapError(() => new TodoError({})),
                      Effect.withSpan('todoStream'),
                    ),
                );
                const last = Chunk.last(result);

                return [
                  result,
                  last.pipe(
                    Option.flatMap((v) =>
                      v.meta._u === next
                        ? Option.none<string>()
                        : Option.some(v.meta._u),
                    ),
                  ),
                ];
              }),
            ).pipe(
              Stream.runCollect,
              Effect.ignore,
              Effect.tap(() => Effect.sync(() => connection?.subscribe?.(id))),
            ),
          );

          return {
            success: true,
          };
        }),

      unsubscribeQuery: () =>
        Effect.gen(function* () {
          const scheduler = yield* (yield* Effect.serviceOption(
            JobScheduler,
          )).pipe(Effect.orDie);
          const connection = yield* (yield* Effect.serviceOption(
            ConnectionService,
          )).pipe(Effect.orDie);
          yield* scheduler.unsubscribe(stringifyObj(id));
          connection.unsubscribe(id);

          return {
            success: true,
          };
        }),

      todoQuery: ({ updatedAt }) =>
        todoEntity
          .index('byUpdated')
          .query(
            {
              pk: { userId },
              sk: {
                '>': updatedAt ? { _u: updatedAt } : null,
              },
            },
            { limit: 10, debug: false },
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
          ),
    };
  }),
);
