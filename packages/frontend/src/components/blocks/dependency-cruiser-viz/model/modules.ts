import type { VisualizationConfig, VizSummary } from './types';

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
  /** Whether this module is a barrel (re-export fan-out point). */
  barrel: boolean;
  /** Whether this module is named by two or more features (emergent sharing). */
  isShared: boolean;
  fileCount: number;
  /** Number of closure violations this module participates in. */
  breachCount: number;
  isBreached: boolean;
};

/**
 * Every declared/covered module as a flat list with barrel flag, shared flag,
 * file count and breach flag. Identity is `(layer, name)`; `config.modules` is
 * merged with `summary.moduleCoverage` (the latter wins for files when both exist).
 *
 * `isShared` is emergent: a module named by ≥2 features in `config.features`.
 * `breachCount`/`isBreached` come from `summary.closureViolations`.
 */
export function allModules(
  config: VisualizationConfig,
  summary: VizSummary | undefined,
): ModuleNode[] {
  const byKey = new Map<string, ModuleNode>();
  const files = moduleFiles(summary);

  // Count how many features declare each module name to determine sharing.
  const featureCountByName = new Map<string, number>();
  for (const f of config.features ?? []) {
    for (const mName of f.modules) {
      featureCountByName.set(mName, (featureCountByName.get(mName) ?? 0) + 1);
    }
  }

  // Build violation counts by module name (fromModule / toModule).
  const violationCountByName = new Map<string, number>();
  for (const v of summary?.closureViolations ?? []) {
    if (v.fromModule) {
      violationCountByName.set(
        v.fromModule,
        (violationCountByName.get(v.fromModule) ?? 0) + 1,
      );
    }
    if (v.toModule) {
      violationCountByName.set(
        v.toModule,
        (violationCountByName.get(v.toModule) ?? 0) + 1,
      );
    }
  }

  const record = (layer: string, name: string, barrel: boolean): void => {
    const key = moduleKey(layer, name);
    if (byKey.has(key)) return;
    const isShared = (featureCountByName.get(name) ?? 0) >= 2;
    const breachCount = violationCountByName.get(name) ?? 0;
    byKey.set(key, {
      key,
      layer,
      name,
      barrel,
      isShared,
      fileCount: files.get(key)?.length ?? 0,
      breachCount,
      isBreached: breachCount > 0,
    });
  };

  for (const m of config.modules ?? []) {
    record(m.layer, m.name, m.barrel);
  }
  for (const m of summary?.moduleCoverage ?? []) {
    record(m.layer, m.module, false);
  }

  return [...byKey.values()];
}
