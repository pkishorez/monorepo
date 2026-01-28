import { Effect, ManagedRuntime } from "effect";

class Service extends Effect.Service<Service>()("Service", {
  effect: Effect.gen(function* () {
    yield* Effect.log("Initializing service...");
    yield* Effect.sleep(4000);
    yield* Effect.log("Service initialized.");
    return {
      api: Effect.succeed("api"),
    };
  }),
}) {}

const runtime = ManagedRuntime.make(Service.Default);

const program = Effect.gen(function* () {
  yield* Effect.log("Starting program...");

  yield* Effect.log("Got service, calling api...");
});

runtime.runPromise(program);
