import { createCollection } from "@tanstack/react-db";
import { stdCollectionOptions } from "@std-toolkit/tanstack";
import { Effect, ManagedRuntime } from "effect";
import { UserSchema } from "../../domain";
import { RpcWs } from "../services/rpc-ws";

export const wsRuntime = ManagedRuntime.make(RpcWs.Default);

const options = stdCollectionOptions({
  schema: UserSchema,
  getKey: (user) => user.id,

  sync: ({ collection }) => {
    return RpcWs.use(({ api, collections }) => {
      collections.add(collection);
      return api.subscribeUsers();
    }).pipe(Effect.provide(wsRuntime), Effect.orDie);
  },

  onInsert: (user) =>
    RpcWs.use(({ api }) =>
      api.CreateUser({
        id: user.id,
        name: user.name,
        evolution: "v2 test!",
        email: user.email,
        status: user.status,
      }),
    ).pipe(Effect.provide(wsRuntime), Effect.orDie),

  onUpdate: (item, partial) =>
    RpcWs.use(({ api }) =>
      api.UpdateUser({
        id: item.id,
        updates: {
          name: partial.name,
          email: partial.email,
          status: partial.status,
        },
      }),
    ).pipe(Effect.provide(wsRuntime), Effect.orDie),
});
// Create user collection with RPC backend
export const usersCollection = createCollection(options);
