import type { ICruiseResult } from 'dependency-cruiser';

import type { VisualizationConfig, VizSummary } from '../types.js';
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
  barrel: boolean;
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

  const moduleEdges = buildModuleEdges({
    moduleEntries,
    modules,
    moduleBySource,
    rootDir,
    ignorePatterns,
  });

  const featureGraphs = buildFeatureGraphs({
    visualization,
    moduleEdges,
  });
  const closureViolations = buildClosureViolations({
    visualization,
    moduleEdges,
    moduleEntries,
    featureGraphs,
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
    moduleEdges,
    featureGraphs,
    closureViolations,
  };
}

/** Build per-feature derived graphs: nodes = declared members, edges = real moduleEdges
 * restricted to the member set.  Barrel out-edges that leave the member set are dropped. */
function buildFeatureGraphs({
  visualization,
  moduleEdges,
}: {
  visualization: VisualizationConfig;
  moduleEdges: VizSummary['moduleEdges'];
}): VizSummary['featureGraphs'] {
  const features = visualization.features ?? [];
  if (features.length === 0) return [];

  return features.map((feat) => {
    // Membership is already resolved to `layer::name` keys at compile time, so
    // nodes/root/edges compare directly on those keys. Each moduleEdge carries
    // its true `fromLayer`/`toLayer`, so an edge is keyed off those — a bare
    // name (e.g. `cart`) that exists in several layers can never be confused.
    const memberKeys = new Set(feat.modules);
    const edges: VizSummary['featureGraphs'][number]['edges'] = [];

    for (const edge of moduleEdges) {
      const fromKey = `${edge.fromLayer}::${edge.fromModule}`;
      const toKey = `${edge.toLayer}::${edge.toModule}`;
      // Both endpoints must be declared members of this feature.
      if (!memberKeys.has(fromKey) || !memberKeys.has(toKey)) continue;
      edges.push({ from: fromKey, to: toKey, kind: edge.kind });
    }

    return {
      feature: feat.name,
      root: feat.root,
      nodes: [...feat.modules],
      edges,
    };
  });
}

/** Compute closure violations:
 *  - closure-escape: non-barrel module exclusive to one feature has a real out-edge
 *    leaving that feature's member set.
 *  - unclaimed-edge: non-barrel-origin real edge not claimed by any feature.
 *  - multi-root / no-root: feature member set has ≠1 node with no in-member inbound edge.
 */
function buildClosureViolations({
  visualization,
  moduleEdges,
  moduleEntries,
  featureGraphs,
}: {
  visualization: VisualizationConfig;
  moduleEdges: VizSummary['moduleEdges'];
  moduleEntries: ModuleEntry[];
  featureGraphs: VizSummary['featureGraphs'];
}): VizSummary['closureViolations'] {
  const features = visualization.features ?? [];
  const violations: VizSummary['closureViolations'] = [];

  // Membership and barrel exemption are keyed by `layer::name` — matching the
  // resolved feature members — so a name that exists in two layers (e.g. a
  // `cart` barrel in orchestrators and a `cart` model in domain) is never
  // conflated. Each moduleEdge endpoint is projected to the same key space.
  const barrelByKey = new Map(
    moduleEntries.map((e) => [`${e.layer}::${e.name}`, e.barrel]),
  );
  const edgeFromKey = (e: VizSummary['moduleEdges'][number]): string =>
    `${e.fromLayer}::${e.fromModule}`;
  const edgeToKey = (e: VizSummary['moduleEdges'][number]): string =>
    `${e.toLayer}::${e.toModule}`;

  // Count how many features each module (by key) belongs to
  const featureCountByModule = new Map<string, number>();
  for (const feat of features) {
    for (const key of feat.modules) {
      featureCountByModule.set(key, (featureCountByModule.get(key) ?? 0) + 1);
    }
  }

  // ── closure-escape ────────────────────────────────────────────────────────
  // A non-barrel module exclusive to exactly one feature has a real out-edge
  // whose target is NOT a member of that feature.
  for (const feat of features) {
    const memberSet = new Set(feat.modules);
    for (const edge of moduleEdges) {
      const fromKey = edgeFromKey(edge);
      if (!memberSet.has(fromKey)) continue;
      if (barrelByKey.get(fromKey)) continue; // barrel: exempt
      const count = featureCountByModule.get(fromKey) ?? 0;
      if (count !== 1) continue; // shared module: relaxed
      const toKey = edgeToKey(edge);
      if (!memberSet.has(toKey)) {
        violations.push({
          reason: 'closure-escape',
          feature: feat.name,
          fromModule: edge.fromModule,
          toModule: edge.toModule,
          detail: `Module "${fromKey}" (exclusive to feature "${feat.name}") imports "${toKey}" which is not a member of that feature.`,
        });
      }
    }
  }

  // ── unclaimed-edge ────────────────────────────────────────────────────────
  // A non-barrel-origin real edge not present in ANY feature's derived edges.
  // An edge is claimed if some feature declares both of its endpoints as members.
  const claimedEdgeKeys = new Set<string>();
  for (const feat of features) {
    const memberSet = new Set(feat.modules);
    for (const edge of moduleEdges) {
      const fromKey = edgeFromKey(edge);
      const toKey = edgeToKey(edge);
      if (memberSet.has(fromKey) && memberSet.has(toKey)) {
        claimedEdgeKeys.add(`${fromKey}\0${toKey}`);
      }
    }
  }
  for (const edge of moduleEdges) {
    const fromKey = edgeFromKey(edge);
    if (barrelByKey.get(fromKey)) continue; // barrel origin: exempt
    const toKey = edgeToKey(edge);
    if (!claimedEdgeKeys.has(`${fromKey}\0${toKey}`)) {
      violations.push({
        reason: 'unclaimed-edge',
        fromModule: edge.fromModule,
        toModule: edge.toModule,
        detail: `Edge "${fromKey}" → "${toKey}" is not claimed by any feature.`,
      });
    }
  }

  // ── multi-root / no-root ──────────────────────────────────────────────────
  // A root is a member node with no inbound edges from OTHER members (barrel roots
  // are allowed to be roots even if they have inbound member edges).
  for (const fg of featureGraphs) {
    const hasInbound = new Set<string>();
    for (const e of fg.edges) {
      hasInbound.add(e.to);
    }
    // Candidate roots: members with no inbound edge from another member
    const roots = fg.nodes.filter((n) => !hasInbound.has(n));
    if (roots.length === 0) {
      violations.push({
        reason: 'no-root',
        feature: fg.feature,
        detail: `Feature "${fg.feature}" has no root node (cycle in member set?).`,
      });
    } else if (roots.length > 1) {
      violations.push({
        reason: 'multi-root',
        feature: fg.feature,
        detail: `Feature "${fg.feature}" has multiple root nodes: ${roots.join(', ')}.`,
      });
    }
  }

  return violations;
}

/** Build cross-module import edges (Task 4 will classify legal vs breach). */
function buildModuleEdges({
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
}): VizSummary['moduleEdges'] {
  const moduleEdgeMap = new Map<string, VizSummary['moduleEdges'][number]>();

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

      const key = `${fromEntry.layer}\0${fromEntry.name}\0${toEntry.layer}\0${toEntry.name}`;
      if (!moduleEdgeMap.has(key)) {
        moduleEdgeMap.set(key, {
          fromLayer: fromEntry.layer,
          fromModule: fromEntry.name,
          toLayer: toEntry.layer,
          toModule: toEntry.name,
          kind: 'legal',
        });
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
    barrel: m.barrel,
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
