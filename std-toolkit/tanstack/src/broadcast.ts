import { Collection } from "@tanstack/react-db";
import { MyUtils } from "./tanstack";
import { broadcastSchema } from "@std-toolkit/core";
import { Schema } from "effect";

export const broadcastCollections = () => {
  let collections: Collection<any, any, MyUtils<any>, any, any>[] = [];
  return {
    add(collection: Collection<any, any, MyUtils<any>, any, any>) {
      collections.push(collection);
    },
    remove(collection: Collection<any, any, MyUtils<any>, any, any>) {
      collections = collections.filter((v) => v !== collection);
    },
    process: (message: unknown) => {
      if (!Schema.is(broadcastSchema)(message)) return;

      const { values } = message;
      for (let value of values) {
        const collection = collections.find(
          (v) => value.meta._e === v.utils.entityName,
        );
        collection?.utils.upsert(value);
      }
    },
  };
};
