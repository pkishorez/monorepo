import type { ICruiseResult } from 'dependency-cruiser';

import type {
  ModuleRules,
  ModuleViolation,
  VisualizationConfig,
  VizSummary,
} from '../types.js';
import { detectLayerConflicts } from './detect-layer-conflicts.js';

type CruiseModule = ICruiseResult['modules'][number];

type LayerPattern = {
  layer: string;
  patterns: RegExp[];
};

type ModuleEntry = {
  path: string;
  name: string;
  layer: string;
  opaque: boolean;
  rules?: ModuleRules;
};

export function summarizeCruiseResult(
  cruiseResult: ICruiseResult,
  visualization: VisualizationConfig,
): VizSummary {
  const layerPatterns = getLayerPatterns(visualization);
  const ignorePatterns = (visualization.ignore ?? []).map(pathToRegExp);
  const rootDir = visualization.rootDir;
  const moduleEntries = getModuleEntries(visualization);

  const allProjectModules = (cruiseResult.modules ?? []).filter((mod) =>
    isProjectPath(mod.source, rootDir),
  );
  const modules = allProjectModules.filter(
    (mod) => !isIgnored(mod.source, ignorePatterns),
  );
  const moduleBySource = new Map(modules.map((mod) => [mod.source, mod]));

  const violations = summarizeLayerViolations(cruiseResult, layerPatterns);
  const coveredFiles: VizSummary['coveredFiles'] = layerPatterns.map(
    ({ layer }) => ({ layer, files: [] }),
  );

  const layerOrphanFiles: string[] = [];
  const ignoredFiles: string[] = [];

  for (const mod of allProjectModules) {
    const source = mod.source;
    if (isIgnored(source, ignorePatterns)) {
      ignoredFiles.push(source);
      continue;
    }
    const firstLayerIndex = layerPatterns.findIndex(({ patterns }) =>
      patterns.some((re) => re.test(source)),
    );
    if (firstLayerIndex === -1) {
      layerOrphanFiles.push(source);
    } else {
      coveredFiles[firstLayerIndex]!.files.push(source);
    }
  }

  const moduleCoverage = buildModuleCoverage({ moduleEntries, modules });

  const coveredByName = new Map(
    moduleCoverage.map((m) => [`${m.layer}\0${m.module}`, m.files.length]),
  );
  const emptyModules: VizSummary['emptyModules'] = moduleEntries
    .filter((e) => (coveredByName.get(`${e.layer}\0${e.name}`) ?? 0) === 0)
    .map((e) => ({ path: e.path, layer: e.layer, name: e.name }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const coverageGaps = modules
    .map((m) => m.source)
    .filter(
      (source) =>
        layerPatterns.some(({ patterns }) =>
          patterns.some((re) => re.test(source)),
        ) && findModule(source, moduleEntries) === undefined,
    )
    .sort((a, b) => a.localeCompare(b));

  const { moduleViolations, breachedPairs } = summarizeModuleViolations({
    moduleEntries,
    modules,
    moduleBySource,
    rootDir,
    ignorePatterns,
  });

  const moduleEdges = buildModuleEdges({
    moduleEntries,
    modules,
    moduleBySource,
    rootDir,
    ignorePatterns,
    breachedPairs,
  });

  return {
    violations,
    layerOrphanFiles,
    ignoredFiles,
    coveredFiles,
    moduleCoverage,
    coverageGaps,
    emptyModules,
    conflicts: detectLayerConflicts(visualization),
    moduleOverlaps: detectModuleOverlaps(moduleEntries),
    moduleEdges,
    moduleViolations,
  };
}

/**
 * Declared modules whose paths nest inside one another. Modules must partition
 * the file set — a hierarchical declaration (an outer module whose path is an
 * ancestor of an inner one) is reported so it can be surfaced as a violation.
 */
function detectModuleOverlaps(
  moduleEntries: ModuleEntry[],
): VizSummary['moduleOverlaps'] {
  const overlaps: VizSummary['moduleOverlaps'] = [];
  for (const outer of moduleEntries) {
    for (const inner of moduleEntries) {
      if (outer === inner) continue;
      if (inner.path.startsWith(outer.path + '/')) {
        overlaps.push({
          outerPath: outer.path,
          outerLayer: outer.layer,
          outerName: outer.name,
          innerPath: inner.path,
          innerLayer: inner.layer,
          innerName: inner.name,
        });
      }
    }
  }
  return overlaps.sort(
    (a, b) =>
      a.outerPath.localeCompare(b.outerPath) ||
      a.innerPath.localeCompare(b.innerPath),
  );
}

/** The allowed-set checks a module's rules normalize to: `leaf` is
 * `onlyImports: []`, `root` is `onlyImportedBy: []`. The original rule name
 * is kept for violation attribution. */
function normalizeRules(entry: ModuleEntry): {
  imports?: { rule: ModuleViolation['rule']; allowed: Set<string> };
  importedBy?: { rule: ModuleViolation['rule']; allowed: Set<string> };
} {
  const rules = entry.rules;
  if (!rules) return {};
  return {
    ...(rules.leaf
      ? { imports: { rule: 'leaf' as const, allowed: new Set<string>() } }
      : rules.onlyImports !== undefined
        ? {
            imports: {
              rule: 'onlyImports' as const,
              allowed: new Set(rules.onlyImports),
            },
          }
        : {}),
    ...(rules.root
      ? { importedBy: { rule: 'root' as const, allowed: new Set<string>() } }
      : rules.onlyImportedBy !== undefined
        ? {
            importedBy: {
              rule: 'onlyImportedBy' as const,
              allowed: new Set(rules.onlyImportedBy),
            },
          }
        : {}),
  };
}

/** Check every cross-module import against the declared module rules. Runs
 * over the raw cruise modules — not the opaque-filtered `moduleEdges` — so an
 * opaque module's outgoing edges are still visible to its own `leaf` rule.
 * Also returns the set of breached module pairs (path-keyed) so
 * `buildModuleEdges` can mark those edges as breaches. */
function summarizeModuleViolations({
  moduleEntries,
  modules,
  moduleBySource,
  rootDir,
  ignorePatterns,
}: {
  moduleEntries: ModuleEntry[];
  modules: CruiseModule[];
  moduleBySource: Map<string, CruiseModule>;
  rootDir: string;
  ignorePatterns: RegExp[];
}): { moduleViolations: ModuleViolation[]; breachedPairs: Set<string> } {
  const normalized = new Map(
    moduleEntries.map((entry) => [entry.path, normalizeRules(entry)]),
  );
  const moduleViolations: ModuleViolation[] = [];
  const breachedPairs = new Set<string>();

  for (const mod of modules) {
    const fromEntry = findModule(mod.source, moduleEntries);
    if (!fromEntry) continue;

    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve || dep.coreModule) continue;
      const target = dep.resolved;
      if (
        !target ||
        !isProjectPath(target, rootDir) ||
        isIgnored(target, ignorePatterns) ||
        !moduleBySource.has(target)
      ) {
        continue;
      }
      const toEntry = findModule(target, moduleEntries);
      if (!toEntry || toEntry.path === fromEntry.path) continue;

      const imports = normalized.get(fromEntry.path)?.imports;
      if (imports && !imports.allowed.has(toEntry.path)) {
        moduleViolations.push({
          module: fromEntry.name,
          rule: imports.rule,
          from: fromEntry.name,
          to: toEntry.name,
          fromFile: mod.source,
          toFile: target,
        });
        breachedPairs.add(`${fromEntry.path}\0${toEntry.path}`);
      }

      const importedBy = normalized.get(toEntry.path)?.importedBy;
      if (importedBy && !importedBy.allowed.has(fromEntry.path)) {
        moduleViolations.push({
          module: toEntry.name,
          rule: importedBy.rule,
          from: fromEntry.name,
          to: toEntry.name,
          fromFile: mod.source,
          toFile: target,
        });
        breachedPairs.add(`${fromEntry.path}\0${toEntry.path}`);
      }
    }
  }

  moduleViolations.sort(
    (a, b) =>
      a.module.localeCompare(b.module) ||
      a.rule.localeCompare(b.rule) ||
      a.fromFile.localeCompare(b.fromFile) ||
      a.toFile.localeCompare(b.toFile),
  );

  return { moduleViolations, breachedPairs };
}

/** Build cross-module import edges. Opaque modules are barrels: their
 * outgoing edges are dropped, incoming edges kept. Edges carrying at least
 * one module-rule violation get kind 'breach'. */
function buildModuleEdges({
  moduleEntries,
  modules,
  moduleBySource,
  rootDir,
  ignorePatterns,
  breachedPairs,
}: {
  moduleEntries: ModuleEntry[];
  modules: CruiseModule[];
  moduleBySource: Map<string, CruiseModule>;
  rootDir: string;
  ignorePatterns: RegExp[];
  breachedPairs: Set<string>;
}): VizSummary['moduleEdges'] {
  const moduleEdgeMap = new Map<string, VizSummary['moduleEdges'][number]>();

  for (const mod of modules) {
    const fromEntry = findModule(mod.source, moduleEntries);
    if (!fromEntry || fromEntry.opaque) continue;

    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve || dep.coreModule) continue;
      const target = dep.resolved;
      if (
        !target ||
        !isProjectPath(target, rootDir) ||
        isIgnored(target, ignorePatterns) ||
        !moduleBySource.has(target)
      ) {
        continue;
      }
      const toEntry = findModule(target, moduleEntries);
      if (!toEntry || toEntry.path === fromEntry.path) continue;

      const key = `${fromEntry.layer}\0${fromEntry.name}\0${toEntry.layer}\0${toEntry.name}`;
      const kind = breachedPairs.has(`${fromEntry.path}\0${toEntry.path}`)
        ? ('breach' as const)
        : ('legal' as const);
      const existing = moduleEdgeMap.get(key);
      if (!existing) {
        moduleEdgeMap.set(key, {
          fromLayer: fromEntry.layer,
          fromModule: fromEntry.name,
          toLayer: toEntry.layer,
          toModule: toEntry.name,
          kind,
        });
      } else if (kind === 'breach') {
        existing.kind = 'breach';
      }
    }
  }

  return [...moduleEdgeMap.values()].sort(
    (a, b) =>
      a.fromLayer.localeCompare(b.fromLayer) ||
      a.fromModule.localeCompare(b.fromModule) ||
      a.toLayer.localeCompare(b.toLayer) ||
      a.toModule.localeCompare(b.toModule),
  );
}

function getLayerPatterns(visualization: VisualizationConfig): LayerPattern[] {
  const layerPatterns: LayerPattern[] = [];
  for (const stack of visualization.stacks) {
    for (const layer of stack.layers) {
      const existing = layerPatterns.find((l) => l.layer === layer.name);
      if (existing) {
        for (const p of layer.paths) {
          existing.patterns.push(pathToRegExp(p));
        }
      } else {
        layerPatterns.push({
          layer: layer.name,
          patterns: layer.paths.map(pathToRegExp),
        });
      }
    }
  }
  return layerPatterns;
}

function getModuleEntries(visualization: VisualizationConfig): ModuleEntry[] {
  return (visualization.modules ?? []).map((m) => ({
    path: m.path,
    name: m.name,
    layer: m.layer,
    opaque: m.opaque,
    ...(m.rules === undefined ? {} : { rules: m.rules }),
  }));
}

/**
 * Returns the most specific declared module a file belongs to, or undefined
 * when the file sits in no declared module.
 */
function findModule(
  file: string,
  moduleEntries: ModuleEntry[],
): ModuleEntry | undefined {
  let best: ModuleEntry | undefined;
  for (const entry of moduleEntries) {
    if (file === entry.path || file.startsWith(entry.path + '/')) {
      if (!best || entry.path.length > best.path.length) {
        best = entry;
      }
    }
  }
  return best;
}

function buildModuleCoverage({
  moduleEntries,
  modules,
}: {
  moduleEntries: ModuleEntry[];
  modules: CruiseModule[];
}): VizSummary['moduleCoverage'] {
  const filesByModule = new Map<string, string[]>();
  for (const entry of moduleEntries) {
    filesByModule.set(entry.path, []);
  }
  const sources = modules
    .map((m) => m.source)
    .sort((a, b) => a.localeCompare(b));
  for (const source of sources) {
    const entry = findModule(source, moduleEntries);
    if (entry) {
      filesByModule.get(entry.path)!.push(source);
    }
  }
  return moduleEntries.map((entry) => ({
    module: entry.name,
    layer: entry.layer,
    files: filesByModule.get(entry.path)!,
  }));
}

function summarizeLayerViolations(
  cruiseResult: ICruiseResult,
  layerPatterns: LayerPattern[],
): VizSummary['violations'] {
  const violations: VizSummary['violations'] = [];
  for (const v of cruiseResult.summary.violations) {
    const fromLayer = findFirstLayer(v.from, layerPatterns);
    const toLayer = findFirstLayer(v.to, layerPatterns);
    if (fromLayer && toLayer) {
      violations.push({
        from: fromLayer,
        to: toLayer,
        fromFile: v.from,
        toFile: v.to,
        rule: v.rule.name,
        severity: v.rule.severity,
      });
    }
  }
  return violations;
}

function findFirstLayer(
  filePath: string,
  layerPatterns: LayerPattern[],
): string | undefined {
  for (const { layer, patterns } of layerPatterns) {
    if (patterns.some((re) => re.test(filePath))) return layer;
  }
  return undefined;
}

function isProjectPath(filePath: string, rootDir: string): boolean {
  return filePath.startsWith(rootDir + '/') || filePath === rootDir;
}

function isIgnored(filePath: string, ignorePatterns: RegExp[]): boolean {
  return ignorePatterns.some((re) => re.test(filePath));
}

function pathToRegExp(p: string): RegExp {
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(/|$)`);
}
