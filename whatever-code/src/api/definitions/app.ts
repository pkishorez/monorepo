import { Rpc, RpcGroup } from "@effect/rpc";
import { BroadcastSchema } from "@std-toolkit/core";
import { Schema } from "effect";

export class AppRpcs extends RpcGroup.make(
  Rpc.make("subscribe", {
    success: BroadcastSchema,
    payload: Schema.Void,
    stream: true,
  }),
).prefix("app.") {}
