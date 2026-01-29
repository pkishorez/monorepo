import { createCollection } from "@tanstack/react-db";
import { stdCollectionOptions } from "@std-toolkit/tanstack";
import { Effect } from "effect";
import { UserSchema } from "../../domain";
import { RealtimeClient, runtime } from "../services";

const options = stdCollectionOptions({
  schema: UserSchema,

  sync: ({ collection, onReady }) => ({
    effect: Effect.gen(function* () {
      const { api, collections } = yield* RealtimeClient;
      collections.add(collection);
      return yield* api.subscribeUsers().pipe(Effect.tap(onReady));
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
});

export const usersCollection = createCollection(options);
