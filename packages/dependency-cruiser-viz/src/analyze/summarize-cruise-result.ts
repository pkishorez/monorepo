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
    // The set of features this module participates in: its owning feature, or
    // every feature it is shared with. `null` marks ownerless infra (the
    // wiring), which may reach shared/public targets but no feature's privates.
    const fromAudience = audienceOf(fromEntry);

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

      if (fromAudience === null) {
        // Infra wiring: shared/public targets are fine; a feature's private
        // internals are not.
        if (toEntry.visibility === 'public' || toEntry.feature === null) {
          continue;
        }
        recordBreach(breaches, seenBreach, {
          fromEntry,
          fromFeature: null,
          toEntry,
          fromFile: mod.source,
          toFile: target,
          reason: 'infra-to-owned',
        });
        continue;
      }

      // A consumer may only reach a target every one of its features is
      // permitted to use; any feature outside the target's audience breaches.
      for (const f of fromAudience) {
        if (permits(toEntry, f)) {
          recordLegalEdges(f, toEntry, edges, moduleEdges);
          continue;
        }
        recordBreach(breaches, seenBreach, {
          fromEntry,
          fromFeature: f,
          toEntry,
          fromFile: mod.source,
          toFile: target,
          reason:
            toEntry.visibility === 'shared'
              ? 'not-in-shared-with'
              : 'private-cross-feature',
        });
      }
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

/**
 * The features a module participates in as a consumer: its owning feature when
 * private, the features it is shared with when shared, or `null` for ownerless
 * infra (public modules with no feature). Public-but-feature-owned modules
 * still carry their owning feature so their imports are attributed correctly.
 */
function audienceOf(entry: ModuleEntry): Set<string> | null {
  if (entry.feature !== null) return new Set([entry.feature]);
  if (entry.sharedWith.length > 0) return new Set(entry.sharedWith);
  return null;
}

/** Whether feature `f` is allowed to import `toEntry`. */
function permits(toEntry: ModuleEntry, f: string): boolean {
  return (
    toEntry.visibility === 'public' ||
    toEntry.feature === f ||
    (toEntry.visibility === 'shared' && toEntry.sharedWith.includes(f))
  );
}

function recordLegalEdges(
  f: string,
  toEntry: ModuleEntry,
  edges: Map<string, Set<string>>,
  moduleEdges: Map<string, VizSummary['featureModuleEdges'][number]>,
): void {
  if (toEntry.feature !== null && toEntry.feature !== f) {
    const key = `${f}\0${toEntry.feature}`;
    const via = edges.get(key) ?? new Set<string>();
    via.add(toEntry.name);
    edges.set(key, via);
  }
  if (toEntry.visibility === 'shared' || toEntry.visibility === 'public') {
    const relation = toEntry.feature === f ? 'owns' : 'consumes';
    const key = `${f}\0${toEntry.layer}\0${toEntry.name}\0${relation}`;
    if (!moduleEdges.has(key)) {
      moduleEdges.set(key, {
        feature: f,
        module: toEntry.name,
        layer: toEntry.layer,
        visibility: toEntry.visibility,
        relation,
      });
    }
  }
}

function recordBreach(
  breaches: VizSummary['breaches'],
  seenBreach: Set<string>,
  b: {
    fromEntry: ModuleEntry;
    fromFeature: string | null;
    toEntry: ModuleEntry;
    fromFile: string;
    toFile: string;
    reason: VizSummary['breaches'][number]['reason'];
  },
): void {
  const breachKey = `${b.fromFile}\0${b.toFile}\0${b.fromFeature ?? ''}`;
  if (seenBreach.has(breachKey)) return;
  seenBreach.add(breachKey);

  breaches.push({
    fromModule: b.fromEntry.name,
    fromFeature: b.fromFeature,
    toModule: b.toEntry.name,
    toFeature: b.toEntry.feature,
    toVisibility: b.toEntry.visibility,
    fromFile: b.fromFile,
    toFile: b.toFile,
    reason: b.reason,
  });
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
