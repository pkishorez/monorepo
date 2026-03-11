import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

export class HelloRpcs extends RpcGroup.make(
  Rpc.make("Hello", {
    success: Schema.String,
    payload: {
      name: Schema.String,
    },
  })
) {}
