import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"

// 1. Simple request/response
// 2. Stream request/response
// 3. Proper payload with success and error

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String }
) {}

export class User extends Schema.Class<User>("User")({
  id: Schema.String,
  name: Schema.String,
}) {}

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

  // 3. Proper payload, success, and error
  Rpc.make("GetUser", {
    success: User,
    error: NotFoundError,
    payload: {
      id: Schema.String,
    },
  })
) {}
