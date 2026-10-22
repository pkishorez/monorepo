import { Duration, Effect, Option, Stream } from 'effect';
import type { Entity } from '@kestack/std-toolkit/core';
import type { Feed } from '../../../store/index.js';

/** How many live changes go out together, and how long the first waits for company. */
const LIVE_BATCH = 100;
const LIVE_WINDOW = Duration.millis(20);

/**
 * Everything a Feed holds after `cursor`, page by page, then every change
 * after that, live. The first page goes out even when it is empty, so the
 * reader knows it has been answered (Caught Up); no later batch is empty. It subscribes before it reads, so a write in between is
 * never lost; a live change already read is dropped by its `_u`, so none
 * goes out twice. Writes land in `_u` order, so `_u` alone decides.
 */
export const follow = <T>(
  feed: Feed<T>,
  cursor: string | null,
): Stream.Stream<ReadonlyArray<Entity<T>>> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const live = yield* feed.changes;
      let last = cursor;
      const seen = (batch: ReadonlyArray<Entity<T>>) => {
        const newest = batch.at(-1)?.meta._u;
        if (newest !== undefined && (last === null || newest > last))
          last = newest;
      };

      const catchUp = Stream.paginate(
        { after: cursor, first: true },
        ({ after, first }) =>
          Effect.map(feed.after(after), ({ items, hasMore }) => {
            const next = items.at(-1)?.meta._u;
            return [
              items.length === 0 && !first ? [] : [items],
              hasMore && next !== undefined
                ? Option.some({ after: next, first: false })
                : Option.none(),
            ] as const;
          }),
      );

      const fresh = live.pipe(
        Stream.filter((entity) => last === null || entity.meta._u > last),
        Stream.groupedWithin(LIVE_BATCH, LIVE_WINDOW),
        Stream.filter((batch) => batch.length > 0),
      );

      return Stream.concat(catchUp, fresh).pipe(
        Stream.tap((batch) => Effect.sync(() => seen(batch))),
      );
    }),
  );
