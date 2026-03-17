import { BroadcastSchema, EntityType } from "@std-toolkit/core";
import { AnyEntityESchema } from "@std-toolkit/eschema";
import { Effect, Schema } from "effect";

type AnyCollectionUtils = {
  upsert: (item: EntityType<any>, persist?: boolean) => void;
  schema: () => AnyEntityESchema;
  fetchAll: () => Effect.Effect<number>;
};

type AnyCollection = { utils: AnyCollectionUtils };

type RegistryInput = {
  utils: {
    upsert: Function;
    schema: () => AnyEntityESchema;
    fetchAll: () => Effect.Effect<number>;
  };
};

type RegistryBuilder = {
  add: (collection: RegistryInput) => RegistryBuilder;
  build: () => CollectionRegistry;
};

type CollectionRegistry = {
  process: (message: unknown, persist?: boolean) => void;
  fetchAll: () => Effect.Effect<number[]>;
};

export const collectionRegistry = {
  create: (): RegistryBuilder => {
    const collections: AnyCollection[] = [];

    const builder: RegistryBuilder = {
      add: (collection) => {
        collections.push(collection as AnyCollection);
        return builder;
      },
      build: () => ({
        process: (message: unknown, persist = false) => {
          if (!Schema.is(BroadcastSchema)(message)) return;

          for (const value of message.values) {
            const target = collections.find(
              (c) => value.meta._e === c.utils.schema().name,
            );
            target?.utils.upsert(value as EntityType<any>, persist);
          }
        },
        fetchAll: () =>
          Effect.all(
            collections.map((c) => c.utils.fetchAll()),
            { concurrency: "unbounded" },
          ),
      }),
    };

    return builder;
  },
};
