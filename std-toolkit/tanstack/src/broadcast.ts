import { BroadcastSchema, EntityType } from '@std-toolkit/core';
import { AnyEntityESchema, AnySingleEntityESchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';

type AnyCollectionUtils = {
  upsert: (item: EntityType<any>, persist?: boolean) => void;
  schema: () => AnyEntityESchema;
  fetchAll: () => Effect.Effect<number>;
};

type AnySingleItemUtils = {
  upsert: (item: EntityType<any>, persist?: boolean) => void;
  schema: () => AnySingleEntityESchema;
  refetch: () => Effect.Effect<void>;
};

type CollectionInput = { utils: AnyCollectionUtils };
type SingleItemInput = { utils: AnySingleItemUtils };

type InternalEntry =
  | { type: 'collection'; utils: AnyCollectionUtils }
  | { type: 'single-item'; utils: AnySingleItemUtils };

type RegistryBuilder = {
  add: (collection: CollectionInput) => RegistryBuilder;
  addSingle: (singleItem: SingleItemInput) => RegistryBuilder;
  build: () => CollectionRegistry;
};

type CollectionRegistry = {
  process: (message: unknown, persist?: boolean) => void;
  fetchAll: Effect.Effect<number[]>;
};

export const collectionRegistry = {
  create: (): RegistryBuilder => {
    const entries: InternalEntry[] = [];

    const builder: RegistryBuilder = {
      add: (collection) => {
        entries.push({ type: 'collection', utils: collection.utils });
        return builder;
      },
      addSingle: (singleItem) => {
        entries.push({ type: 'single-item', utils: singleItem.utils });
        return builder;
      },
      build: () => ({
        process: (message: unknown, persist = false) => {
          if (!Schema.is(BroadcastSchema)(message)) return;

          for (const value of message.values) {
            const target = entries.find(
              (e) => value.meta._e === e.utils.schema().name,
            );
            target?.utils.upsert(value as EntityType<any>, persist);
          }
        },
        fetchAll: Effect.all(
          entries.map((e) =>
            e.type === 'collection'
              ? e.utils.fetchAll()
              : e.utils.refetch().pipe(Effect.map(() => 0)),
          ),
          { concurrency: 'unbounded' },
        ),
      }),
    };

    return builder;
  },
};
