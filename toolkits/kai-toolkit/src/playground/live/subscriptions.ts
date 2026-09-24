import { Duration, Effect, Option, Stream } from 'effect';
import type { DecodedEntity } from 'std-toolkit/core';
import type { QueryPage, StdTableService } from 'std-toolkit/db';
import { SYNC_PAGE_SIZE } from '../../runtime/constants.js';
import {
  messages,
  threads,
  type Message,
  type Thread,
} from '../../runtime/table/index.js';

type AiTableService = StdTableService<'kai-toolkit'>;
type Batch<T extends object> = ReadonlyArray<DecodedEntity<T>>;

const PUSH_BATCH_SIZE = 100;
const PUSH_WINDOW = 25;

const catchUp = <T extends object>(
  fetchPage: (
    cursor: DecodedEntity<T> | null,
  ) => Effect.Effect<QueryPage<DecodedEntity<T>>, never, AiTableService>,
  cursor: DecodedEntity<T> | null,
): Stream.Stream<Batch<T>, never, AiTableService> =>
  Stream.paginate(cursor, (after) =>
    Effect.map(fetchPage(after), (page) => {
      const last = page.items.at(-1);
      return [
        page.items.length === 0 ? [] : [page.items],
        page.hasMore && last !== undefined
          ? Option.some<DecodedEntity<T> | null>(last)
          : Option.none<DecodedEntity<T> | null>(),
      ] as const;
    }),
  );

const watch = <T extends object>(config: {
  readonly cursor: DecodedEntity<T> | null;
  readonly fetchPage: (
    cursor: DecodedEntity<T> | null,
  ) => Effect.Effect<QueryPage<DecodedEntity<T>>, never, AiTableService>;
  readonly subscribe: () => Stream.Stream<DecodedEntity<T>>;
}): Stream.Stream<Batch<T>, never, AiTableService> =>
  Stream.concat(
    catchUp(config.fetchPage, config.cursor),
    Stream.suspend(config.subscribe).pipe(
      Stream.groupedWithin(PUSH_BATCH_SIZE, Duration.millis(PUSH_WINDOW)),
    ),
  ).pipe(
    Stream.map((batch) =>
      batch.map((row) => ({
        ...row,
        meta: { ...row.meta, _s: Date.now() },
      })),
    ),
  );

const page = <T extends object>(after: DecodedEntity<T> | null) => ({
  limit: SYNC_PAGE_SIZE,
  ...(after === null ? {} : { after }),
});

export const watchThreads = (
  cursor: DecodedEntity<Thread> | null,
): Stream.Stream<Batch<Thread>, never, AiTableService> =>
  watch({
    cursor,
    fetchPage: (after) =>
      threads
        .query('byUpdate', { pk: {}, '>=': null }, page(after))
        .pipe(Effect.orDie),
    subscribe: () => threads.subscribe(),
  });

export const watchMessages = (
  threadId: string,
  cursor: DecodedEntity<Message> | null,
): Stream.Stream<Batch<Message>, never, AiTableService> =>
  watch({
    cursor,
    fetchPage: (after) =>
      messages
        .query('byThreadUpdate', { pk: { threadId }, '>=': null }, page(after))
        .pipe(Effect.orDie),
    subscribe: () => messages.subscribe({ threadId }),
  });
