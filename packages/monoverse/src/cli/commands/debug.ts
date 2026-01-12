import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import { toRelativePath } from "../../core/primitives/fs/index.js";
import { theme as c } from "../../theme.js";

export const debug = Command.make("debug", {}, () =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const analysis = yield* monoverse.analyze(process.cwd());

    yield* Console.log(`Root ${c.accent}${analysis.root}${c.reset}\n`);
    yield* Console.log(`Workspaces (${analysis.workspaces.length})\n`);

    for (const workspace of analysis.workspaces) {
      const relativePath = toRelativePath(workspace.path, analysis.root);
      yield* Console.log(
        `  ${c.primary}${workspace.name}${c.reset} ${c.accent}${relativePath}${c.reset}`,
      );
    }

    if (analysis.errors.length > 0) {
      yield* Console.log(`\nErrors (${analysis.errors.length})\n`);
      for (const error of analysis.errors) {
        const relativePath = toRelativePath(error.path, analysis.root);
        yield* Console.log(`  ${c.accent}${relativePath}${c.reset}: ${c.muted}${error.message}${c.reset}`);
      }
    }
  }),
);
