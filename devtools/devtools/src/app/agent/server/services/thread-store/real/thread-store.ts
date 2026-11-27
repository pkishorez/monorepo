import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Effect, Layer, Option, Schema } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { MessageSchema } from '../../../rpc/agent/contract/index.js';
import {
  ThreadStore,
  ThreadStoreError,
  type ThreadStoreShape,
} from '../contract/index.js';
import {
  messages,
  table,
  tableName,
  threads,
  type MessageEntitySchema,
  type ThreadEntitySchema,
} from './stored-threads.js';

type StoredMessage = Entity<typeof MessageEntitySchema.Type>;
type StoredThreadEntity = Entity<typeof ThreadEntitySchema.Type>;

const storeError = (operation: string, cause: unknown) =>
  new ThreadStoreError({
    message: `DevTools could not ${operation} its Threads: ${String(cause)}`,
  });

const idOf = (seq: number) => String(seq).padStart(9, '0');

const MessageJson = Schema.fromJsonString(MessageSchema);
const encoded = Schema.encodeEffect(MessageJson);
const decoded = Schema.decodeEffect(MessageJson);

const makeSqliteThreadStore = (path: string) =>
  Effect.gen(function* () {
    const database = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          if (path !== ':memory:')
            mkdirSync(dirname(path), { recursive: true });
          return makeNodeSQLite({ path });
        },
        catch: (cause) => storeError('open', cause),
      }),
      (driver) => Effect.sync(() => driver.close?.()),
    );
    const configured = SQLite.make(table, { database, tableName });
    const stored = <A, E>(
      operation: string,
      effect: Effect.Effect<A, E, Layer.Success<typeof configured.layer>>,
    ) =>
      Effect.provide(effect, configured.layer).pipe(
        Effect.mapError((cause) => storeError(operation, cause)),
      );

    yield* SQLite.setup(table, {
      database,
      tableName,
      mode: 'persistent',
    }).pipe(Effect.mapError((cause) => storeError('set up', cause)));

    const messagesOf = (thread: string) =>
      Effect.gen(function* () {
        const items: Array<StoredMessage['value']> = [];
        let after: StoredMessage | undefined;
        for (;;) {
          const page = yield* messages.query(
            'primary',
            { pk: { thread }, '>': null },
            after === undefined ? undefined : { after },
          );
          items.push(...page.items.map((item) => item.value));
          const last = page.items.at(-1);
          if (!page.hasMore || last === undefined) return items;
          after = last;
        }
      });

    const threadsAll = () =>
      Effect.gen(function* () {
        const items: Array<StoredThreadEntity['value']> = [];
        let after: StoredThreadEntity | undefined;
        for (;;) {
          const page = yield* threads.query(
            'primary',
            { pk: {}, '>': null },
            after === undefined ? undefined : { after },
          );
          items.push(...page.items.map((item) => item.value));
          const last = page.items.at(-1);
          if (!page.hasMore || last === undefined) return items;
          after = last;
        }
      });

    const shape: ThreadStoreShape = {
      all: () =>
        stored(
          'read',
          Effect.gen(function* () {
            const saved = yield* threadsAll();
            const loaded = yield* Effect.forEach(saved, (thread) =>
              Effect.gen(function* () {
                const items = yield* messagesOf(thread.id);
                const last = items.at(-1);
                return {
                  thread,
                  messages: yield* Effect.forEach(items, ({ message }) =>
                    decoded(message),
                  ),
                  next: last === undefined ? 0 : Number(last.id) + 1,
                };
              }).pipe(Effect.option),
            );
            return loaded.flatMap((one) =>
              Option.isSome(one) ? [one.value] : [],
            );
          }),
        ),
      create: (thread) => stored('save', Effect.asVoid(threads.insert(thread))),
      append: (thread, from, added) =>
        stored(
          'save',
          Effect.forEach(
            added,
            (message, index) =>
              Effect.flatMap(encoded(message), (json) =>
                messages.insert({
                  id: idOf(from + index),
                  thread,
                  message: json,
                }),
              ),
            { discard: true },
          ),
        ),
      resumed: (thread, session) =>
        stored(
          'save',
          Effect.asVoid(threads.getAndUpdate({ id: thread }, { session })),
        ),
      remove: (thread) =>
        stored(
          'clear',
          Effect.gen(function* () {
            yield* threads.hardDelete({ id: thread }, 'I KNOW WHAT I AM DOING');
            const items = yield* messagesOf(thread);
            yield* Effect.forEach(
              items,
              ({ id }) =>
                messages.hardDelete({ thread, id }, 'I KNOW WHAT I AM DOING'),
              { discard: true },
            );
          }),
        ),
    };
    return shape;
  });

export const sqliteThreadStoreLayer = (options: { readonly path: string }) =>
  Layer.effect(ThreadStore, makeSqliteThreadStore(options.path));
