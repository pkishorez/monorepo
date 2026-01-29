import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { makeEntityRpcGroup } from "@std-toolkit/core/rpc";
import { UserSchema, UserError } from "./schemas";

export class AppRpcs extends RpcGroup.make(
  ...makeEntityRpcGroup(UserSchema),

  Rpc.make("subscribeUsers", {
    success: Schema.Array(Schema.Any),
    error: UserError,
  }),
) {}
