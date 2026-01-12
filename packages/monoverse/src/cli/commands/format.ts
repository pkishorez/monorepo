import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import { cwd } from "../helpers.js";

export const format = Command.make("format", {}, () =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const analysis = yield* monoverse.analyze(cwd);

    yield* monoverse.formatAllWorkspaces(analysis);

    yield* Console.log(`Formatted ${analysis.workspaces.length} workspaces`);
  }),
);
