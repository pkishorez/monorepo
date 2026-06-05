import type { ICruiseResult } from 'dependency-cruiser';

import type { Visibility, VisualizationConfig, VizSummary } from '../types.js';

type CruiseModule = ICruiseResult['modules'][number];

type LayerPattern = {
  layer: string;
  patterns: RegExp[];
};

type ModuleEntry = {
  path: string;
  name: string;
  layer: string;
  feature: string | null;
  visibility: Visibility;
  sharedWith: string[];
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

  const coverageGaps = modules
    .map((m) => m.source)
    .filter(
      (source) =>
        layerPatterns.some(({ patterns }) =>
          patterns.some((re) => re.test(source)),
        ) && findModule(source, moduleEntries) === undefined,
    )
    .sort((a, b) => a.localeCompare(b));

  const { breaches, featureEdges, featureModuleEdges } = enforce({
    moduleEntries,
    modules,
    moduleBySource,
    rootDir,
    ignorePatterns,
  });

  return {
    violations,
    layerOrphanFiles,
    ignoredFiles,
    coveredFiles,
    moduleCoverage,
    coverageGaps,
    breaches,
    featureEdges,
    featureModuleEdges,
  };
}

function enforce({
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
}): {
  breaches: VizSummary['breaches'];
  featureEdges: VizSummary['featureEdges'];
  featureModuleEdges: VizSummary['featureModuleEdges'];
} {
  const breaches: VizSummary['breaches'] = [];
  const seenBreach = new Set<string>();

  /** key `from\0to` -> set of `via` module names. */
  const edges = new Map<string, Set<string>>();

  /** key `feature\0layer\0module\0relation` -> record. */
  const moduleEdges = new Map<
    string,
    VizSummary['featureModuleEdges'][number]
  >();

  for (const mod of modules) {
    const fromEntry = findModule(mod.source, moduleEntries);
    if (!fromEntry) continue;
    const F = fromEntry.feature;

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

      const legal =
        toEntry.visibility === 'public' ||
        (F !== null && toEntry.feature === F) ||
        (toEntry.visibility === 'shared' &&
          F !== null &&
          toEntry.sharedWith.includes(F)) ||
        (F === null && toEntry.feature === null);

      if (legal) {
        if (toEntry.feature !== null && toEntry.feature !== F && F !== null) {
          const key = `${F}\0${toEntry.feature}`;
          const via = edges.get(key) ?? new Set<string>();
          via.add(toEntry.name);
          edges.set(key, via);
        }
        if (
          F !== null &&
          (toEntry.visibility === 'shared' || toEntry.visibility === 'public')
        ) {
          const relation = toEntry.feature === F ? 'owns' : 'consumes';
          const key = `${F}\0${toEntry.layer}\0${toEntry.name}\0${relation}`;
          if (!moduleEdges.has(key)) {
            moduleEdges.set(key, {
              feature: F,
              module: toEntry.name,
              layer: toEntry.layer,
              visibility: toEntry.visibility,
              relation,
            });
          }
        }
        continue;
      }

      const reason: VizSummary['breaches'][number]['reason'] =
        F === null
          ? 'infra-to-owned'
          : toEntry.visibility === 'shared'
            ? 'not-in-shared-with'
            : 'private-cross-feature';

      const breachKey = `${mod.source}\0${target}`;
      if (seenBreach.has(breachKey)) continue;
      seenBreach.add(breachKey);

      breaches.push({
        fromModule: fromEntry.name,
        fromFeature: F,
        toModule: toEntry.name,
        toFeature: toEntry.feature,
        toVisibility: toEntry.visibility,
        fromFile: mod.source,
        toFile: target,
        reason,
      });
    }
  }

  const featureEdges: VizSummary['featureEdges'] = [...edges.entries()]
    .map(([key, via]) => {
      const [from, to] = key.split('\0');
      return {
        from: from!,
        to: to!,
        via: [...via].sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  breaches.sort(
    (a, b) =>
      a.fromFile.localeCompare(b.fromFile) || a.toFile.localeCompare(b.toFile),
  );

  const featureModuleEdges: VizSummary['featureModuleEdges'] = [
    ...moduleEdges.values(),
  ].sort(
    (a, b) =>
      a.feature.localeCompare(b.feature) ||
      a.layer.localeCompare(b.layer) ||
      a.module.localeCompare(b.module) ||
      a.relation.localeCompare(b.relation),
  );

  return { breaches, featureEdges, featureModuleEdges };
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
    feature: m.feature ?? null,
    visibility: m.visibility,
    sharedWith: m.sharedWith ?? [],
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
  return moduleEntries.map((entry) => {
    const out: VizSummary['moduleCoverage'][number] = {
      module: entry.name,
      layer: entry.layer,
      visibility: entry.visibility,
      files: filesByModule.get(entry.path)!,
    };
    if (entry.feature !== null) {
      out.feature = entry.feature;
    }
    if (entry.sharedWith.length > 0) {
      out.sharedWith = entry.sharedWith;
    }
    return out;
  });
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
