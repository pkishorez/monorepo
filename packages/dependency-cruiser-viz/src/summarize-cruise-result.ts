import type { ICruiseResult } from 'dependency-cruiser';

import type {
  FeatureGraphViolation,
  VisualizationConfig,
  VizSummary,
} from './types.js';

type CruiseModule = ICruiseResult['modules'][number];
type CruiseDependency = CruiseModule['dependencies'][number];
type DependencyKind = 'runtime' | 'type-only';
type FeatureGraph = NonNullable<VizSummary['featureGraphs']>[number];
type FeatureGraphNode = FeatureGraph['nodes'][number];

type LayerPattern = {
  layer: string;
  patterns: RegExp[];
};

export function summarizeCruiseResult(
  cruiseResult: ICruiseResult,
  visualization: VisualizationConfig,
): VizSummary {
  const layerPatterns = getLayerPatterns(visualization);
  const ignorePatterns = (visualization.ignore ?? []).map(pathToRegExp);
  const rootDir = visualization.rootDir;
  const allProjectModules = (cruiseResult.modules ?? []).filter((mod) =>
    isProjectPath(mod.source, rootDir),
  );
  const modules = allProjectModules.filter(
    (mod) => !isIgnored(mod.source, ignorePatterns),
  );
  const moduleBySource = new Map(modules.map((mod) => [mod.source, mod]));
  const allProjectModuleSources = new Set(
    allProjectModules.map((mod) => mod.source),
  );

  const violations = summarizeLayerViolations(cruiseResult, layerPatterns);
  const coveredFiles: VizSummary['coveredFiles'] = layerPatterns.map(
    ({ layer }) => ({
      layer,
      files: [],
    }),
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

  const result: VizSummary = {
    violations,
    layerOrphanFiles,
    ignoredFiles,
    coveredFiles,
  };

  if (visualization.features && visualization.features.length > 0) {
    const featureResults = visualization.features.map((feature) =>
      buildFeatureGraph({
        feature,
        moduleBySource,
        allProjectModuleSources,
        rootDir,
        ignorePatterns,
        layerPatterns,
      }),
    );
    const featureGraphs = featureResults.map((r) => r.graph);
    const featureGraphFiles = new Set<string>();
    const featureGraphViolations = featureResults.flatMap((r) => r.violations);

    for (const graph of featureGraphs) {
      for (const node of graph.nodes) {
        featureGraphFiles.add(node.file);
      }
    }

    result.featureGraphs = featureGraphs;
    result.featureOrphanFiles = modules
      .map((mod) => mod.source)
      .filter((source) => !featureGraphFiles.has(source));
    result.featureGraphViolations = featureGraphViolations;
  }

  return result;
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

function buildFeatureGraph({
  feature,
  moduleBySource,
  allProjectModuleSources,
  rootDir,
  ignorePatterns,
  layerPatterns,
}: {
  feature: NonNullable<VisualizationConfig['features']>[number];
  moduleBySource: Map<string, CruiseModule>;
  allProjectModuleSources: Set<string>;
  rootDir: string;
  ignorePatterns: RegExp[];
  layerPatterns: LayerPattern[];
}): {
  graph: FeatureGraph;
  violations: FeatureGraphViolation[];
} {
  const seeds = [...new Set(feature.paths)];
  const seedSet = new Set(seeds);
  const nodes = new Map<string, FeatureGraphNode>();
  const edgeKinds = new Map<string, DependencyKind>();
  const violations: FeatureGraphViolation[] = [];
  const violationKeys = new Set<string>();

  for (const seed of seeds) {
    validateSeed({
      featureName: feature.name,
      seed,
      moduleBySource,
      allProjectModuleSources,
      rootDir,
      ignorePatterns,
      layerPatterns,
    });
  }

  function addNode(file: string, depth: number): void {
    const layers = findLayers(file, layerPatterns);
    if (layers.length === 0) {
      throw new Error(
        `Feature "${feature.name}" reaches "${file}", but that file is not covered by any layer`,
      );
    }

    const existing = nodes.get(file);
    const kind = seedSet.has(file) ? 'seed' : 'derived';
    if (!existing) {
      nodes.set(file, {
        file,
        kind,
        layers,
        minDepth: depth,
        maxDepth: depth,
      });
      return;
    }

    existing.minDepth = Math.min(existing.minDepth, depth);
    existing.maxDepth = Math.max(existing.maxDepth, depth);
    if (kind === 'seed') existing.kind = 'seed';
  }

  function addEdge(
    from: string,
    to: string,
    dependencyKind: DependencyKind,
  ): void {
    const key = edgeKey(from, to);
    const existing = edgeKinds.get(key);
    if (!existing || existing === 'type-only' || dependencyKind === 'runtime') {
      edgeKinds.set(key, dependencyKind);
    }
  }

  function addViolation(violation: FeatureGraphViolation): void {
    const key =
      violation.kind === 'feature-cycle'
        ? `${violation.kind}:${violation.feature}:${violation.cycle.join('->')}`
        : `${violation.kind}:${violation.feature}:${violation.fromFile}:${violation.specifier}`;
    if (violationKeys.has(key)) return;
    violationKeys.add(key);
    violations.push(violation);
  }

  function walk(file: string, depth: number, path: string[]): void {
    addNode(file, depth);
    const mod = moduleBySource.get(file);
    if (!mod) return;

    for (const dep of mod.dependencies) {
      if (dep.couldNotResolve) {
        if (isProjectSpecifier(dep.module, rootDir)) {
          addViolation({
            kind: 'feature-unresolved-import',
            feature: feature.name,
            fromFile: file,
            specifier: dep.module,
            severity: 'error',
          });
        }
        continue;
      }

      const target = dep.resolved;
      if (
        !target ||
        dep.coreModule ||
        !isProjectPath(target, rootDir) ||
        isIgnored(target, ignorePatterns)
      ) {
        continue;
      }

      if (!moduleBySource.has(target)) {
        throw new Error(
          `Feature "${feature.name}" reaches "${target}", but that file is not present in the dependency graph`,
        );
      }

      const dependencyKind = getDependencyKind(dep);
      addEdge(file, target, dependencyKind);

      const cycleStart = path.indexOf(target);
      if (cycleStart !== -1) {
        addViolation({
          kind: 'feature-cycle',
          feature: feature.name,
          fromFile: file,
          toFile: target,
          cycle: [...path.slice(cycleStart), target],
          severity: 'error',
        });
        continue;
      }

      if (dependencyKind === 'type-only') {
        addNode(target, depth + 1);
        continue;
      }

      walk(target, depth + 1, [...path, target]);
    }
  }

  for (const seed of seeds) {
    walk(seed, 0, [seed]);
  }

  return {
    graph: {
      feature: feature.name,
      seeds,
      nodes: [...nodes.values()].sort((a, b) => a.file.localeCompare(b.file)),
      edges: [...edgeKinds.entries()]
        .map(([key, dependencyKind]) => {
          const [from, to] = splitEdgeKey(key);
          return { from, to, dependencyKind };
        })
        .sort(
          (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
        ),
    },
    violations,
  };
}

function validateSeed({
  featureName,
  seed,
  moduleBySource,
  allProjectModuleSources,
  rootDir,
  ignorePatterns,
  layerPatterns,
}: {
  featureName: string;
  seed: string;
  moduleBySource: Map<string, CruiseModule>;
  allProjectModuleSources: Set<string>;
  rootDir: string;
  ignorePatterns: RegExp[];
  layerPatterns: LayerPattern[];
}): void {
  if (!isProjectPath(seed, rootDir) || seed === rootDir) {
    throw new Error(
      `Feature "${featureName}" seed "${seed}" must be a file under "${rootDir}"`,
    );
  }
  if (isIgnored(seed, ignorePatterns)) {
    throw new Error(
      `Feature "${featureName}" seed "${seed}" is ignored and cannot be used as a feature seed`,
    );
  }
  if (!allProjectModuleSources.has(seed) || !moduleBySource.has(seed)) {
    throw new Error(
      `Feature "${featureName}" seed "${seed}" must be a file present in the dependency graph`,
    );
  }
  if (findLayers(seed, layerPatterns).length === 0) {
    throw new Error(
      `Feature "${featureName}" seed "${seed}" is not covered by any layer`,
    );
  }
}

function findFirstLayer(
  filePath: string,
  layerPatterns: LayerPattern[],
): string | undefined {
  return findLayers(filePath, layerPatterns)[0];
}

function findLayers(filePath: string, layerPatterns: LayerPattern[]): string[] {
  const layers: string[] = [];
  for (const { layer, patterns } of layerPatterns) {
    if (patterns.some((re) => re.test(filePath)) && !layers.includes(layer)) {
      layers.push(layer);
    }
  }
  return layers;
}

function getDependencyKind(dep: CruiseDependency): DependencyKind {
  return dep.typeOnly === true ||
    dep.preCompilationOnly === true ||
    dep.dependencyTypes.includes('type-only') ||
    dep.dependencyTypes.includes('pre-compilation-only')
    ? 'type-only'
    : 'runtime';
}

function isProjectPath(filePath: string, rootDir: string): boolean {
  return filePath.startsWith(rootDir + '/') || filePath === rootDir;
}

function isProjectSpecifier(specifier: string, rootDir: string): boolean {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('/') ||
    specifier.startsWith(rootDir + '/') ||
    specifier.startsWith('@/') ||
    specifier === rootDir
  );
}

function isIgnored(filePath: string, ignorePatterns: RegExp[]): boolean {
  return ignorePatterns.some((re) => re.test(filePath));
}

function edgeKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

function splitEdgeKey(key: string): [string, string] {
  const [from, to] = key.split('\0');
  return [from!, to!];
}

function pathToRegExp(p: string): RegExp {
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}(/|$)`);
}
