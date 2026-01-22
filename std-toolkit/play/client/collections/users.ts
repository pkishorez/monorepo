import { createCollection } from "@tanstack/react-db";
import { stdCollectionOptions, EntityType } from "@std-toolkit/tanstack";
import { Effect, ManagedRuntime } from "effect";
import { User, UserSchema } from "../../domain";
import { RpcWs } from "../services/rpc-ws";

// WebSocket RPC runtime (shared)
export const wsRuntime = ManagedRuntime.make(RpcWs.Default);

const options = stdCollectionOptions({
  schema: UserSchema,
  runtime: wsRuntime,
  getKey: (user) => user.id,

  // Initial sync - fetch all users
  sync: () =>
    RpcWs.use((rpc) =>
      rpc.ListUsers({ limit: 100 }).pipe(Effect.map((result) => result.items)),
    ),

  // Insert via RPC
  onInsert: (user) =>
    Effect.gen(function* () {
      yield* Effect.sleep("3 seconds");
      return yield* RpcWs.use((rpc) =>
        rpc.CreateUser({
          id: user.id,
          name: user.name,
          evolution: "v2 test!",
          email: user.email,
          status: user.status,
        }),
      );
    }),

  // Update via RPC
  onUpdate: (partial) =>
    Effect.gen(function* () {
      yield* Effect.sleep("3 seconds");
      const result = yield* RpcWs.use((rpc) =>
        rpc.UpdateUser({
          id: partial.id!,
          updates: {
            name: partial.name,
            email: partial.email,
            status: partial.status,
          },
        }),
      );
      return { value: partial, meta: result.meta };
    }),
});
// Create user collection with RPC backend
export const usersCollection = createCollection(options);

export type UserEntity = EntityType<User>;
