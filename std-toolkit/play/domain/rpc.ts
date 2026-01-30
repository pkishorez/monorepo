import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";
import { makeEntityRpcGroup, StdToolkitError } from "@std-toolkit/core/rpc";
import { makeCommandRpc } from "@std-toolkit/core/command";
import { UserSchema, PostSchema, CommentSchema, LikeSchema } from "./schemas";

const SubscribePayload = Schema.Struct({
  uid: Schema.String.pipe(Schema.NullOr),
});

const SubscribeSuccess = Schema.Struct({ success: Schema.Boolean });

export class AppRpcs extends RpcGroup.make(
  ...makeEntityRpcGroup(UserSchema),
  ...makeEntityRpcGroup(PostSchema),
  ...makeEntityRpcGroup(CommentSchema),
  ...makeEntityRpcGroup(LikeSchema),
  makeCommandRpc(),

  Rpc.make("subscribeUser", {
    payload: SubscribePayload,
    success: SubscribeSuccess,
    error: StdToolkitError,
  }),
  Rpc.make("subscribePost", {
    payload: SubscribePayload,
    success: SubscribeSuccess,
    error: StdToolkitError,
  }),
  Rpc.make("subscribeComment", {
    payload: SubscribePayload,
    success: SubscribeSuccess,
    error: StdToolkitError,
  }),
  Rpc.make("subscribeLike", {
    payload: SubscribePayload,
    success: SubscribeSuccess,
    error: StdToolkitError,
  }),
) {}
