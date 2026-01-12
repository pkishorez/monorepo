import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import { toRelativePath } from "../../core/primitives/fs/index.js";
import { theme as c } from "../../theme.js";
import { formatToTree } from "../format/tree.js";

export const ls = Command.make("ls", {}, () =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const analysis = yield* monoverse.analyze(process.cwd());

    yield* Console.log(`Workspaces (${analysis.workspaces.length})\n`);

    const tree = formatToTree(
      analysis.workspaces.map((w) => ({ path: w.path, name: w.name })),
      { root: analysis.root, cwd: process.cwd() },
    );
    yield* Console.log(tree);

    if (analysis.errors.length > 0) {
      yield* Console.log(`\nErrors (${analysis.errors.length})\n`);
      for (const error of analysis.errors) {
        const relativePath = toRelativePath(error.path, analysis.root);
        yield* Console.log(`  ${c.accent}${relativePath}${c.reset}: ${c.muted}${error.message}${c.reset}`);
      }
    }
  }),
);
