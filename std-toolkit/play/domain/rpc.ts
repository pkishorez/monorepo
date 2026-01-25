import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { entitySchema } from "@std-toolkit/core";
import { UserSchema, NotFoundError, UserError } from "./schemas";

const UserEntitySchema = entitySchema(UserSchema);

export class AppRpcs extends RpcGroup.make(
  Rpc.make("Ping", {
    success: Schema.String,
  }),

  Rpc.make("Counter", {
    success: Schema.Number,
    stream: true,
    payload: {
      count: Schema.Number,
    },
  }),

  Rpc.make("GetUser", {
    success: UserEntitySchema,
    error: NotFoundError,
    payload: {
      id: Schema.String,
    },
  }),

  Rpc.make("CreateUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: UserSchema.schema,
  }),

  Rpc.make("UpdateUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: {
      id: Schema.String,
      updates: Schema.partial(Schema.Struct(UserSchema.schema).omit("id")),
    },
  }),

  Rpc.make("subscribeUsers", {
    success: Schema.Array(Schema.Any),
    error: UserError,
  }),

  Rpc.make("DeleteUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: {
      id: Schema.String,
    },
  }),

  Rpc.make("ListUsers", {
    success: Schema.Struct({
      items: Schema.Array(UserEntitySchema),
    }),
    error: UserError,
    payload: {
      limit: Schema.optional(Schema.Number),
    },
  }),
) {}
