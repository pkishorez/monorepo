import { BroadcastSchema, EntityType } from "@std-toolkit/core";
import { AnyESchema } from "@std-toolkit/eschema";
import { Schema } from "effect";

type AnyCollectionUtils = {
  upsert: (item: EntityType<any>, persist?: boolean) => void;
  schema: () => AnyESchema;
};

type AnyCollection = { utils: AnyCollectionUtils };

export const broadcastCollections = () => {
  let collections: AnyCollection[] = [];

  return {
    add: (collection: {
      utils: { upsert: Function; schema: () => AnyESchema };
    }) => {
      collections.push(collection as AnyCollection);
    },
    remove: (collection: {
      utils: { upsert: Function; schema: () => AnyESchema };
    }) => {
      collections = collections.filter((c) => c !== collection);
    },
    process: (message: unknown) => {
      if (!Schema.is(BroadcastSchema)(message)) return;

      for (const value of message.values) {
        const target = collections.find(
          (c) => value.meta._e === c.utils.schema().name,
        );
        target?.utils.upsert(value as EntityType<any>, true);
      }
    },
  };
};
