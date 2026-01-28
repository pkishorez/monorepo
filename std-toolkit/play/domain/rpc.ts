import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { MetaSchema } from "@std-toolkit/core";
import { UserSchema, NotFoundError, UserError } from "./schemas";

// Define UserEntitySchema inline to avoid module initialization issues
const UserEntitySchema = Schema.Struct({
  value: UserSchema.schema,
  meta: MetaSchema,
});

// CreateUser payload - id is generated on server, so exclude it
// Use fields directly and omit the id field
const { id: _id, ...createUserFields } = UserSchema.fields;
const CreateUserPayload = Schema.Struct(createUserFields);

// UpdateUser updates - partial of schema without id
const UpdateUserUpdates = Schema.partial(CreateUserPayload);

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
    payload: CreateUserPayload,
  }),

  Rpc.make("UpdateUser", {
    success: UserEntitySchema,
    error: UserError,
    payload: {
      id: Schema.String,
      updates: UpdateUserUpdates,
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
