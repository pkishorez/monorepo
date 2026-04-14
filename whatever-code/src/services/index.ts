import { BroadcastSchema } from "@std-toolkit/core";
import { ConnectionService } from "@std-toolkit/core/server";
import { Effect, Layer } from "effect";
import { BroadcastService } from "./broadcast.js";
import { WorktreeService } from "./worktree.js";
import { applyProjection } from "../projection.js";

const connectionServiceLayer = Layer.effect(
  ConnectionService,
  Effect.gen(function* () {
    const broadcast = yield* BroadcastService;
    return ConnectionService.of({
      broadcast: (value) => {
        const projected = applyProjection(value);
        if (!projected) return;
        Effect.runFork(
          broadcast.publish(
            BroadcastSchema.make({
              _tag: "@std-toolkit/broadcast",
              values: [projected],
            }),
          ),
        );
      },
      emit: (values) => {
        const projected = values
          .map(applyProjection)
          .filter(
            (v): v is NonNullable<typeof v> => v !== null,
          );
        if (projected.length === 0) return;
        Effect.runFork(
          broadcast.publish(
            BroadcastSchema.make({
              _tag: "@std-toolkit/broadcast",
              values: projected,
            }),
          ),
        );
      },
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
