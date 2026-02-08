import { createCollection } from "@tanstack/react-db";
import { stdCollectionOptions } from "@std-toolkit/tanstack";
import { Effect } from "effect";
import { UserSchema } from "../../domain";
import { RealtimeClient, runtime } from "../services";
import { IDBCacheEntity } from "./cache";

const userCache = await Effect.runPromise(
  IDBCacheEntity.make({ eschema: UserSchema }),
);

export const usersCollection = createCollection(
  stdCollectionOptions({
    schema: UserSchema,
    cache: userCache,

    sync: ({ collection, onReady }) => ({
      mode: "subscription" as const,
      effect: (latest) =>
        Effect.gen(function* () {
          const { api, collections } = yield* RealtimeClient;
          collections.add(collection);
          return yield* api
            .subscribeUser({ uid: latest?.meta._uid ?? null })
            .pipe(Effect.tap(onReady));
        }).pipe(Effect.provide(runtime), Effect.orDie),
    }),

    onInsert: (payload) =>
      Effect.gen(function* () {
        const { api } = yield* RealtimeClient;
        return yield* api.insertUser(payload);
      }).pipe(Effect.provide(runtime), Effect.orDie),

    onUpdate: (payload) =>
      Effect.gen(function* () {
        const { api } = yield* RealtimeClient;
        return yield* api.updateUser(payload);
      }).pipe(Effect.provide(runtime), Effect.orDie),
  }),
);
