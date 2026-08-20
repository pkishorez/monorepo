import { Effect, Option, Stream, type Schedule } from 'effect';
import type {
  DecodedEntity,
  DecodedSingleEntity,
} from '../../../core/index.js';

type Cursor<TItem> = DecodedEntity<TItem> | null;
type Batch<TItem> = ReadonlyArray<DecodedEntity<TItem>>;
type NonEmptyBatch<TItem> = readonly [
  DecodedEntity<TItem>,
  ...DecodedEntity<TItem>[],
];

const SourceTypeId: unique symbol = Symbol.for('std-toolkit/SyncSource');

type PaginatedSource<TItem, R = never> = {
  readonly [SourceTypeId]: true;
  readonly _tag: 'Paginated';
  readonly fetch: (input: {
    cursor: Cursor<TItem>;
  }) => Effect.Effect<Batch<TItem>, unknown, R>;
};

type PollSource<TItem, R = never> = {
  readonly [SourceTypeId]: true;
  readonly _tag: 'Poll';
  readonly fetch: (input: {
    cursor: Cursor<TItem>;
  }) => Effect.Effect<Batch<TItem>, unknown, R>;
  readonly schedule: Schedule.Schedule<unknown, Batch<TItem>, unknown, R>;
};

type LiveSource<TItem, R = never> = {
  readonly [SourceTypeId]: true;
  readonly _tag: 'Live';
  readonly open: (input: {
    cursor: Cursor<TItem>;
  }) => Stream.Stream<Batch<TItem>, unknown, R>;
};

type ForwardSource<TItem, R = never> =
  | PaginatedSource<TItem, R>
  | PollSource<TItem, R>
  | LiveSource<TItem, R>;

type OnceSource<TItem, R = never> = {
  readonly [SourceTypeId]: true;
  readonly _tag: 'Once';
  readonly fetch: () => Effect.Effect<DecodedSingleEntity<TItem>, unknown, R>;
};

type SingleItemPollSource<TItem, R = never> = {
  readonly [SourceTypeId]: true;
  readonly _tag: 'SingleItemPoll';
  readonly fetch: () => Effect.Effect<DecodedSingleEntity<TItem>, unknown, R>;
  readonly schedule: Schedule.Schedule<
    unknown,
    DecodedSingleEntity<TItem>,
    unknown,
    R
  >;
};

type SubscriptionSource<TItem, R = never> = {
  readonly [SourceTypeId]: true;
  readonly _tag: 'Subscribe';
  readonly open: () => Stream.Stream<DecodedSingleEntity<TItem>, unknown, R>;
};

type SingleItemSource<TItem, R = never> =
  | OnceSource<TItem, R>
  | SingleItemPollSource<TItem, R>
  | SubscriptionSource<TItem, R>;

const paginated = <TItem extends object, R = never>(config: {
  fetch: (input: {
    cursor: Cursor<TItem>;
  }) => Effect.Effect<Batch<TItem>, unknown, R>;
}): PaginatedSource<TItem, R> => ({
  [SourceTypeId]: true,
  _tag: 'Paginated',
  fetch: config.fetch,
});

const poll = <TItem extends object, R = never>(config: {
  fetch: (input: {
    cursor: Cursor<TItem>;
  }) => Effect.Effect<Batch<TItem>, unknown, R>;
  schedule: Schedule.Schedule<unknown, Batch<TItem>, unknown, R>;
}): PollSource<TItem, R> => ({
  [SourceTypeId]: true,
  _tag: 'Poll',
  fetch: config.fetch,
  schedule: config.schedule,
});

const live = <TItem extends object, R = never>(config: {
  open: (input: {
    cursor: Cursor<TItem>;
  }) => Stream.Stream<Batch<TItem>, unknown, R>;
}): LiveSource<TItem, R> => ({
  [SourceTypeId]: true,
  _tag: 'Live',
  open: config.open,
});

const once = <TItem extends object, R = never>(config: {
  fetch: () => Effect.Effect<DecodedSingleEntity<TItem>, unknown, R>;
}): OnceSource<TItem, R> => ({
  [SourceTypeId]: true,
  _tag: 'Once',
  fetch: config.fetch,
});

const pollSingleItem = <TItem extends object, R = never>(config: {
  fetch: () => Effect.Effect<DecodedSingleEntity<TItem>, unknown, R>;
  schedule: Schedule.Schedule<unknown, DecodedSingleEntity<TItem>, unknown, R>;
}): SingleItemPollSource<TItem, R> => ({
  [SourceTypeId]: true,
  _tag: 'SingleItemPoll',
  fetch: config.fetch,
  schedule: config.schedule,
});

const subscribe = <TItem extends object, R = never>(config: {
  open: () => Stream.Stream<DecodedSingleEntity<TItem>, unknown, R>;
}): SubscriptionSource<TItem, R> => ({
  [SourceTypeId]: true,
  _tag: 'Subscribe',
  open: config.open,
});

export const partitionedSources = { paginated, poll, live };
export const singleItemSources = { once, poll: pollSingleItem, subscribe };

export type ForwardSourceBuilder<TItem, R = never> = (
  sources: typeof partitionedSources,
) => ForwardSource<TItem, R>;

export type PaginatedSourceBuilder<TItem, R = never> = (
  sources: Pick<typeof partitionedSources, 'paginated'>,
) => PaginatedSource<TItem, R>;

export type LiveSourceBuilder<TItem, R = never> = (
  sources: Pick<typeof partitionedSources, 'live'>,
) => LiveSource<TItem, R>;

export type SingleItemSourceBuilder<TItem, R = never> = (
  sources: typeof singleItemSources,
) => SingleItemSource<TItem, R>;

const isNonEmpty = <TItem>(
  batch: Batch<TItem>,
): batch is NonEmptyBatch<TItem> => batch.length > 0;

export const openPartitionedSource = <TItem extends object, R = never>(
  source: ForwardSource<TItem, R>,
  input: {
    cursor: Cursor<TItem>;
    nextCursor: (batch: NonEmptyBatch<TItem>) => DecodedEntity<TItem>;
  },
): Stream.Stream<NonEmptyBatch<TItem>, unknown, R> => {
  if (source._tag === 'Live') {
    return source
      .open({ cursor: input.cursor })
      .pipe(Stream.filter(isNonEmpty));
  }

  if (source._tag === 'Poll') {
    let cursor = input.cursor;
    const fetch = Effect.suspend(() => source.fetch({ cursor })).pipe(
      Effect.tap((batch) =>
        Effect.sync(() => {
          if (isNonEmpty(batch)) cursor = input.nextCursor(batch);
        }),
      ),
    );
    return Stream.fromEffectSchedule(fetch, source.schedule).pipe(
      Stream.filter(isNonEmpty),
    );
  }

  return Stream.paginate(input.cursor, (cursor) =>
    source.fetch({ cursor }).pipe(
      Effect.map((batch) => {
        if (!isNonEmpty(batch)) return [[], Option.none()] as const;
        const next = input.nextCursor(batch);
        // A backend whose cursor is inclusive returns the floor page forever,
        // so stop as soon as the cursor stops moving.
        const exhausted = cursor !== null && next.meta._u === cursor.meta._u;
        return [
          [batch],
          exhausted ? Option.none() : Option.some(next),
        ] as const;
      }),
    ),
  );
};

export const openSingleItemSource = <TItem extends object, R = never>(
  source: SingleItemSource<TItem, R>,
): Stream.Stream<DecodedSingleEntity<TItem>, unknown, R> => {
  switch (source._tag) {
    case 'Once':
      return Stream.fromEffect(Effect.suspend(source.fetch));
    case 'SingleItemPoll':
      return Stream.fromEffectSchedule(
        Effect.suspend(source.fetch),
        source.schedule,
      );
    case 'Subscribe':
      return source.open();
  }
};
