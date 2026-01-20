import { RpcGroup, Rpc } from "@effect/rpc";
import { Effect, Schema } from "effect";

const test1 = Rpc.make("test1", {
  payload: Schema.Struct({ name: Schema.String }),
  success: Schema.String,
});

const test2 = Rpc.make("test2", {
  payload: Schema.Struct({ age: Schema.Number }),
  success: Schema.Number,
});

const testGroup = RpcGroup.make(test1, test2).prefix("tes.");

const handlers = testGroup.toLayer({
  "tes.test1": () => Effect.succeed("Hello World!"),
  "tes.test2": () => Effect.succeed(1),
});
