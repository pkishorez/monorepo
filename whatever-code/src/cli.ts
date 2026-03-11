import { Console, Effect } from "effect";

const main = Effect.gen(function* () {
  yield* Console.log("whatever-code CLI is running");
});

Effect.runPromise(main).catch(console.error);
