import { Effect } from "effect";
import { HelloRpcs } from "../definitions/index.js";

export const HelloHandlers = HelloRpcs.toLayer(
  Effect.succeed({
    Hello: ({ name }) => Effect.succeed(`Hello, ${name}!`),
  })
);
