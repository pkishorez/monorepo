import { Args, Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import { findCurrentWorkspace } from "../helpers.js";

const packageArg = Args.text({ name: "package" });

const handler = ({ package: pkg }: { package: string }) =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const { workspace } = yield* findCurrentWorkspace;

    yield* monoverse.removeDependency({
      packageName: pkg,
      workspace,
    });

    yield* Console.log(`Removed ${pkg} from ${workspace.name}`);
  });

export const rm = Command.make("rm", { package: packageArg }, handler);
