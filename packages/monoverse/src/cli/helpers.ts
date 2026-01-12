import { Effect } from "effect";
import { Monoverse } from "../core/index.js";

export const findCurrentWorkspace = Effect.gen(function* () {
  const cwd = process.cwd();
  const monoverse = yield* Monoverse;
  const analysis = yield* monoverse.analyze(cwd);
  const workspace = analysis.workspaces
    .sort((a, z) => z.path.length - a.path.length)
    .find((ws) => cwd.startsWith(ws.path));

  if (!workspace) {
    return yield* Effect.fail(
      new Error(
        "Not inside a workspace. Run from within a workspace directory.",
      ),
    );
  }
  return { analysis, workspace };
});

export type DependencyTypeShort = "dependency" | "dev" | "peer" | "optional";

export const toDependencyType = (type: DependencyTypeShort) => {
  const map = {
    dependency: "dependency",
    dev: "devDependency",
    peer: "peerDependency",
    optional: "optionalDependency",
  } as const;
  return map[type];
};
