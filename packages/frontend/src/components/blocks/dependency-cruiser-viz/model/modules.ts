import type { ModuleRules, VisualizationConfig, VizSummary } from './types';

/**
 * A module's globally-unique key, scoping the layer-derived name by its layer so
 * two layers can share a trailing module name (e.g. `server/auth` vs
 * `services/auth`) without colliding. Matches the canvas node id scheme.
 */
export function moduleKey(layer: string, name: string): string {
  return `${layer}::${name}`;
}

/**
 * Files of a module, keyed by `layer::name`, from `summary.moduleCoverage`.
 */
export function moduleFiles(
  summary: VizSummary | undefined,
): Map<string, string[]> {
  const files = new Map<string, string[]>();
  for (const m of summary?.moduleCoverage ?? []) {
    files.set(moduleKey(m.layer, m.module), m.files);
  }
  return files;
}

/**
 * A module's position in the import graph, derived from its edge degrees:
 * - `root`: imported by others but imports nothing (a foundation everyone
 *   depends on).
 * - `leaf`: imports others but nothing imports it (an entrypoint).
 * - `dead`: neither imports nor is imported (possibly unused).
 * - `normal`: both imports and is imported.
 *
 * A declared-opaque module (outgoing edges hidden) is never `leaf`/`dead`
 * since its out-degree is unknown; it is `root` when imported, else `normal`.
 */
export type ModuleRole = 'root' | 'leaf' | 'dead' | 'normal';

export type ModuleNode = {
  /** `layer::name` key, matching {@link moduleKey} and the canvas node id. */
  key: string;
  layer: string;
  name: string;
  /** Whether this module is opaque (a barrel — outgoing edges not analyzed). */
  opaque: boolean;
  /** Enforced rules declared on the module, if any. */
  rules?: ModuleRules;
  /** Number of rules declared on the module (root/leaf count as one each). */
  ruleCount: number;
  /** Position in the import graph — drives connectivity color-coding. */
  role: ModuleRole;
  fileCount: number;
  /** Number of breach edges this module participates in. */
  breachCount: number;
  isBreached: boolean;
};

/**
 * Every declared/covered module as a flat list with opaque flag, rules, file
 * count and breach flag. Identity is `(layer, name)`; `config.modules` is merged with
 * `summary.moduleCoverage` (the latter wins for files when both exist).
 *
 * `breachCount`/`isBreached` come from breach-kind `summary.moduleEdges`.
 */
export function allModules(
  config: VisualizationConfig,
  summary: VizSummary | undefined,
): ModuleNode[] {
  const byKey = new Map<string, ModuleNode>();
  const files = moduleFiles(summary);

  const breachCountByKey = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const e of summary?.moduleEdges ?? []) {
    const from = moduleKey(e.fromLayer, e.fromModule);
    const to = moduleKey(e.toLayer, e.toModule);
    bump(outDegree, from);
    bump(inDegree, to);
    if (e.kind !== 'breach') continue;
    for (const key of [from, to]) {
      breachCountByKey.set(key, (breachCountByKey.get(key) ?? 0) + 1);
    }
  }

  const record = (
    layer: string,
    name: string,
    opaque: boolean,
    rules?: ModuleRules,
  ): void => {
    const key = moduleKey(layer, name);
    if (byKey.has(key)) return;
    const breachCount = breachCountByKey.get(key) ?? 0;
    byKey.set(key, {
      key,
      layer,
      name,
      opaque,
      ...(rules === undefined ? {} : { rules }),
      ruleCount: countRules(rules),
      role: moduleRole(inDegree.get(key) ?? 0, outDegree.get(key) ?? 0, opaque),
      fileCount: files.get(key)?.length ?? 0,
      breachCount,
      isBreached: breachCount > 0,
    });
  };

  for (const m of config.modules ?? []) {
    record(m.layer, m.name, m.opaque, m.rules);
  }
  for (const m of summary?.moduleCoverage ?? []) {
    record(m.layer, m.module, false);
  }

  return [...byKey.values()];
}

function countRules(rules: ModuleRules | undefined): number {
  if (!rules) return 0;
  return (
    (rules.root ? 1 : 0) +
    (rules.leaf ? 1 : 0) +
    (rules.onlyImports !== undefined ? 1 : 0) +
    (rules.onlyImportedBy !== undefined ? 1 : 0)
  );
}

/** Human-readable one-liners for each rule declared on a module. */
export function describeRules(rules: ModuleRules | undefined): string[] {
  if (!rules) return [];
  const lines: string[] = [];
  if (rules.root) lines.push('Root — no module may import this');
  if (rules.leaf) lines.push('Leaf — imports no module');
  if (rules.onlyImports !== undefined) {
    lines.push(
      rules.onlyImports.length === 0
        ? 'Only imports: (none)'
        : `Only imports: ${rules.onlyImports.join(', ')}`,
    );
  }
  if (rules.onlyImportedBy !== undefined) {
    lines.push(
      rules.onlyImportedBy.length === 0
        ? 'Only imported by: (none)'
        : `Only imported by: ${rules.onlyImportedBy.join(', ')}`,
    );
  }
  return lines;
}

/** Classify a module by its import-graph degrees. See {@link ModuleRole}. */
function moduleRole(
  inDegree: number,
  outDegree: number,
  declaredOpaque: boolean,
): ModuleRole {
  // A declared-opaque's out-edges are hidden, so out-degree is unknown: it can
  // only be a leaf (imported) or normal, never root/dead.
  if (declaredOpaque) return inDegree > 0 ? 'leaf' : 'normal';
  if (inDegree > 0 && outDegree === 0) return 'leaf';
  if (outDegree > 0 && inDegree === 0) return 'root';
  if (inDegree === 0 && outDegree === 0) return 'dead';
  return 'normal';
}
