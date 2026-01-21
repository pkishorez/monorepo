import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { entitySchema } from "@std-toolkit/tanstack";
import {
  UserSchema,
  NotFoundError,
  UserNotFoundError,
  UserValidationError,
  UserDatabaseError,
} from "./schemas";

const UserEntitySchema = entitySchema(UserSchema);
const UserError = Schema.Union(
  UserNotFoundError,
  UserValidationError,
  UserDatabaseError
);

export class AppRpcs extends RpcGroup.make(
  // 1. Simple request/response - no payload, just returns a string
  Rpc.make("Ping", {
    success: Schema.String,
  }),

  // 2. Stream request/response - returns a stream of numbers
  Rpc.make("Counter", {
    success: Schema.Number,
    stream: true,
    payload: {
      count: Schema.Number,
    },
  }),

  // 3. GetUser - returns entity format
  Rpc.make("GetUser", {
    success: UserEntitySchema,
    error: NotFoundError,
    payload: {
      id: Schema.String,
    },
  }),

  // 4. CreateUser
  Rpc.make("CreateUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: {
      name: Schema.String,
      email: Schema.String,
      status: Schema.optional(Schema.Literal("active", "inactive", "pending")),
    },
  }),

  // 5. UpdateUser
  Rpc.make("UpdateUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: {
      id: Schema.String,
      name: Schema.optional(Schema.String),
      email: Schema.optional(Schema.String),
      status: Schema.optional(Schema.Literal("active", "inactive", "pending")),
    },
  }),

  // 6. DeleteUser
  Rpc.make("DeleteUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: {
      id: Schema.String,
    },
  }),

  // 7. ListUsers
  Rpc.make("ListUsers", {
    success: Schema.Struct({
      items: Schema.Array(UserEntitySchema),
      cursor: Schema.NullOr(Schema.String),
    }),
    error: UserError,
    payload: {
      cursor: Schema.optional(Schema.String),
      limit: Schema.optional(Schema.Number),
      status: Schema.optional(Schema.Literal("active", "inactive", "pending")),
    },
  })
) {}
