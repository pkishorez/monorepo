import { BroadcastSchema } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";
import { Effect, Layer } from "effect";
import { BroadcastService } from "./broadcast.js";
import { WorktreeService } from "./worktree.js";

const connectionServiceLayer = Layer.effect(
  ConnectionService,
  Effect.gen(function* () {
    const broadcast = yield* BroadcastService;
    return ConnectionService.of({
      broadcast: (value) =>
        Effect.runFork(
          broadcast.publish(
            BroadcastSchema.make({
              _tag: "@std-toolkit/broadcast",
              values: [value],
            }),
          ),
        ),
      emit: () => Effect.runFork(Effect.die("emit: not implemented")),
      subscribe: () => Effect.runFork(Effect.die("subscribe: not implemented")),
      unsubscribe: () =>
        Effect.runFork(Effect.die("unsubscribe: not implemented")),
    });
  }),
);

export const ServicesLayer = Layer.mergeAll(
  connectionServiceLayer,
  WorktreeService.Default,
).pipe(Layer.provideMerge(BroadcastService.Default));
