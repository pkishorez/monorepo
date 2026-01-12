import { Command } from "@effect/cli";
import { Console, Effect } from "effect";
import { Monoverse } from "../../core/index.js";
import type { Violation } from "../../core/pipeline/validate/index.js";
import type { Workspace } from "../../core/pipeline/analyze/index.js";
import { theme as c } from "../../theme.js";
import { formatToTree, type TreeItem } from "../format/tree.js";

const formatViolationDetail = (v: Violation): string => {
  switch (v._tag) {
    case "ViolationVersionMismatch": {
      const versions = v.allVersions.map((ver) =>
        ver === v.versionRange
          ? `${c.warning}${ver}${c.reset}`
          : `${c.muted}${ver}${c.reset}`
      );
      return `${c.muted}${v.package}${c.reset} ${c.error}VersionMismatch${c.reset} (${versions.join(", ")})`;
    }
    case "ViolationUnpinnedVersion":
      return `${c.muted}${v.package}${c.reset} ${c.error}UnpinnedVersion${c.reset} (${c.warning}${v.versionRange}${c.reset})`;
    case "ViolationFormatPackageJson":
      return `${c.error}FormatPackageJson${c.reset}`;
    case "ViolationDuplicateWorkspace":
      return `${c.error}DuplicateWorkspace${c.reset} ${c.muted}(${v.paths.join(", ")})${c.reset}`;
  }
};

const buildViolationsTree = (
  violations: Violation[],
  workspaces: Workspace[],
  root: string,
): TreeItem[] => {
  const violationsByWorkspace = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = violationsByWorkspace.get(v.workspace) ?? [];
    list.push(v);
    violationsByWorkspace.set(v.workspace, list);
  }

  const workspaceByName = new Map(workspaces.map((w) => [w.name, w]));

  const items: TreeItem[] = [];
  for (const [workspaceName, workspaceViolations] of violationsByWorkspace) {
    const workspace = workspaceByName.get(workspaceName);
    if (!workspace) continue;

    const annotations = workspaceViolations.map(formatViolationDetail);

    items.push({
      path: workspace.path,
      name: workspace.name,
      annotations,
    });
  }

  return items;
};

export const lint = Command.make("lint", {}, () =>
  Effect.gen(function* () {
    const monoverse = yield* Monoverse;
    const analysis = yield* monoverse.analyze(process.cwd());
    const violations = yield* monoverse.validate(analysis);

    if (violations.length === 0) {
      yield* Console.log(`${c.success}No issues found${c.reset}`);
      return;
    }

    yield* Console.error(
      `${c.error}Found ${violations.length} issues${c.reset}\n`,
    );

    const items = buildViolationsTree(
      violations,
      analysis.workspaces,
      analysis.root,
    );
    const tree = formatToTree(items, { root: analysis.root });
    yield* Console.error(tree);

    yield* Effect.sync(() => process.exit(1));
  }),
);
