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

  onInsert: (user) =>
    Effect.gen(function* () {
      const { api } = yield* RealtimeClient;
      return yield* api.CreateUser({
        name: user.name,
        evolution: "v2 test!",
        email: user.email,
        status: user.status,
      });
    }).pipe(Effect.provide(runtime), Effect.orDie),

  onUpdate: (item, partial) =>
    Effect.gen(function* () {
      const { api } = yield* RealtimeClient;
      return yield* api.UpdateUser({
        id: item.id,
        updates: {
          name: partial.name,
          email: partial.email,
          status: partial.status,
        },
      });
    }).pipe(Effect.provide(runtime), Effect.orDie),
});

export const usersCollection = createCollection(options);
