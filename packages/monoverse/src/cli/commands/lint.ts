import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import { cwd } from "../helpers.js";
import { Violation } from "../../core/pipeline/validate/index.js";
import { Workspace } from "../../core/pipeline/analyze/index.js";
import { theme as c } from "../theme.js";

const formatViolations = (
  violations: Violation[],
  workspaces: Workspace[],
  root: string,
) => {
  const pathByName = new Map(
    workspaces.map((w) => [
      w.name,
      w.path === root ? "." : w.path.replace(root + "/", ""),
    ]),
  );

  const grouped = new Map<string, Map<string, Violation[]>>();
  for (const v of violations) {
    if (!grouped.has(v.workspace)) {
      grouped.set(v.workspace, new Map());
    }
    const pkgMap = grouped.get(v.workspace)!;
    if (!pkgMap.has(v.package)) {
      pkgMap.set(v.package, []);
    }
    pkgMap.get(v.package)!.push(v);
  }

  const formatDetail = (v: Violation): string => {
    const tag = v._tag.replace("Violation", "");
    if (v._tag === "ViolationVersionMismatch" && v.allVersions) {
      return `${tag} (${v.allVersions.join(", ")})`;
    }
    if (v._tag === "ViolationUnpinnedVersion" && v.versionRange) {
      return `${tag} (${v.versionRange})`;
    }
    if (v._tag === "ViolationDuplicateWorkspace" && v.paths) {
      return `${tag} (${v.paths.join(", ")})`;
    }
    return tag;
  };

  const lines: string[] = [];
  for (const [workspace, packages] of grouped) {
    const path = pathByName.get(workspace) ?? "";
    lines.push(`${c.primary}${workspace} ${c.accent}${path}${c.reset}`);
    for (const [pkg, vList] of packages) {
      const details = vList.map(formatDetail).join(", ");
      lines.push(`${c.muted}  ${pkg.padEnd(28)}${c.error}${details}${c.reset}`);
    }
  }

  return lines.join("\n");
};

export const lint = Command.make("lint", {}, () =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const analysis = yield* monoverse.analyze(cwd);
    const violations = yield* monoverse.validate(analysis);

    if (violations.length === 0) {
      yield* Console.log(`${c.success}No issues found${c.reset}`);
      return;
    }

    yield* Console.error(
      `${c.error}Found ${violations.length} issues${c.reset}\n`,
    );
    yield* Console.error(
      formatViolations(violations, analysis.workspaces, analysis.root),
    );
    yield* Effect.sync(() => process.exit(1));
  }),
);
