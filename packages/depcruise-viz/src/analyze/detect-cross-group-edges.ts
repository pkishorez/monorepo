import type { ICruiseResult } from 'dependency-cruiser';

import {
  DEFAULT_GROUP,
  type Visibility,
  type VisualizationConfig,
} from '../types.js';

type ModuleEntry = {
  path: string;
  name: string;
  group: string;
  visibility: Visibility;
};

/** An import that crosses a group boundary into another group's private module. */
export type CrossGroupEdge = {
  fromGroup: string;
  toGroup: string;
  fromModule: string;
  toModule: string;
  fromFile: string;
  toFile: string;
};

/**
 * Groups are isolated: a module in one group may only reach another group
 * through its public/shared surface (a barrel). Reaching another group's
 * `private` internals is forbidden. This finds every such crossing.
 *
 * The implicit default group (ungrouped stacks) has no boundary — edges to or
 * from it are never cross-group.
 */
export function detectCrossGroupEdges(
  cruiseResult: ICruiseResult,
  visualization: VisualizationConfig,
): CrossGroupEdge[] {
  const rootDir = visualization.rootDir;
  const entries: ModuleEntry[] = (visualization.modules ?? []).map((m) => ({
    path: m.path,
    name: m.name,
    group: m.group ?? DEFAULT_GROUP,
    visibility: m.visibility,
  }));

  const findModule = (file: string): ModuleEntry | undefined => {
    let best: ModuleEntry | undefined;
    for (const entry of entries) {
      if (file === entry.path || file.startsWith(entry.path + '/')) {
        if (!best || entry.path.length > best.path.length) best = entry;
      }
    }
    return best;
  };

  const edges: CrossGroupEdge[] = [];
  const seen = new Set<string>();

  for (const mod of cruiseResult.modules ?? []) {
    const from = findModule(mod.source);
    if (!from || from.group === DEFAULT_GROUP) continue;

    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve || dep.coreModule) continue;
      const target = dep.resolved;
      if (!target || !isProjectPath(target, rootDir)) continue;

      const to = findModule(target);
      if (!to || to.group === DEFAULT_GROUP) continue;
      if (to.group === from.group) continue;
      // Public/shared surfaces are the sanctioned crossing point; only private
      // internals are walled off across groups.
      if (to.visibility !== 'private') continue;

      const key = `${mod.source}\0${target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      edges.push({
        fromGroup: from.group,
        toGroup: to.group,
        fromModule: from.name,
        toModule: to.name,
        fromFile: mod.source,
        toFile: target,
      });
    }
  }

  edges.sort(
    (a, b) =>
      a.fromFile.localeCompare(b.fromFile) || a.toFile.localeCompare(b.toFile),
  );
  return edges;
}

/**
 * Throws if any import crosses a group boundary into a private target. Author-
 * time fail-fast — groups are meant to be isolated.
 */
export function assertGroupIsolation(
  cruiseResult: ICruiseResult,
  visualization: VisualizationConfig,
): void {
  const edges = detectCrossGroupEdges(cruiseResult, visualization);
  if (edges.length === 0) return;
  const lines = edges
    .slice(0, 10)
    .map(
      (e) =>
        `  ${e.fromFile} (group "${e.fromGroup}") → ${e.toFile} (group "${e.toGroup}", private)`,
    );
  const more = edges.length > 10 ? `\n  …and ${edges.length - 10} more` : '';
  throw new Error(
    `Cross-group dependency: ${edges.length} import(s) reach another group's private internals. ` +
      `Groups are isolated — route through a shared/public barrel instead.\n${lines.join('\n')}${more}`,
  );
}

function isProjectPath(filePath: string, rootDir: string): boolean {
  return filePath.startsWith(rootDir + '/') || filePath === rootDir;
}
