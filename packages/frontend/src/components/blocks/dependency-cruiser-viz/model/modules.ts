import type { VisualizationConfig, Visibility, VizSummary } from './types';

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

export type ModuleNode = {
  /** `layer::name` key, matching {@link moduleKey} and the canvas node id. */
  key: string;
  layer: string;
  name: string;
  /** Owning feature, or null for an unowned utility. */
  feature: string | null;
  visibility: Visibility;
  sharedWith: string[];
  fileCount: number;
  isBreached: boolean;
};

/**
 * Every declared/covered module as a flat list with its tier (visibility),
 * owner, file count and breach flag — the right-hand nodes of the bipartite
 * Features graph. Identity is `(layer, name)`; `config.modules` is merged with
 * `summary.moduleCoverage` (the latter wins for files/owner when both exist).
 */
export function allModules(
  config: VisualizationConfig,
  summary: VizSummary | undefined,
): ModuleNode[] {
  const byKey = new Map<string, ModuleNode>();
  const files = moduleFiles(summary);

  const record = (
    layer: string,
    name: string,
    feature: string | undefined,
    visibility: Visibility,
    sharedWith: readonly string[] | undefined,
  ): void => {
    const key = moduleKey(layer, name);
    const existing = byKey.get(key);
    if (existing) {
      if (feature) existing.feature = feature;
      return;
    }
    byKey.set(key, {
      key,
      layer,
      name,
      feature: feature ?? null,
      visibility,
      sharedWith: [...(sharedWith ?? [])],
      fileCount: files.get(key)?.length ?? 0,
      isBreached: false,
    });
  };

  for (const m of config.modules ?? []) {
    record(m.layer, m.name, m.feature, m.visibility, m.sharedWith);
  }
  for (const m of summary?.moduleCoverage ?? []) {
    record(m.layer, m.module, m.feature, m.visibility, m.sharedWith);
  }

  const breachedNames = new Set<string>();
  for (const b of summary?.breaches ?? []) {
    breachedNames.add(b.fromModule);
    breachedNames.add(b.toModule);
  }
  for (const node of byKey.values()) {
    if (breachedNames.has(node.name)) node.isBreached = true;
  }

  return [...byKey.values()];
}

/**
 * Resolve a breach's `toModule` NAME to a module node key. Breaches carry names
 * (not layers), so we match by name; when several layers share the name we
 * prefer the one whose owning feature matches `toFeature`, then the one whose
 * visibility matches `toVisibility`. Returns null when unresolvable/ambiguous.
 */
export function resolveBreachModule(
  modules: ModuleNode[],
  toModule: string,
  toFeature: string | null,
  toVisibility: Visibility,
): string | null {
  const matches = modules.filter((m) => m.name === toModule);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.key;
  const byFeature = matches.filter((m) => m.feature === toFeature);
  if (byFeature.length === 1) return byFeature[0]!.key;
  const pool = byFeature.length > 0 ? byFeature : matches;
  const byVis = pool.filter((m) => m.visibility === toVisibility);
  if (byVis.length === 1) return byVis[0]!.key;
  return null;
}
