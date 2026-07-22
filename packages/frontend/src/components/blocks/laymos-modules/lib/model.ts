import type { LaymosReport, ReportModuleRules } from 'laymos/report';

export interface ModuleFileEdge {
  readonly from: string;
  readonly to: string;
  readonly violating: boolean;
}

export interface ObservedModuleEdge {
  readonly from: string;
  readonly to: string;
  readonly fileEdges: readonly ModuleFileEdge[];
  readonly violating: boolean;
}

export interface ModuleBoundaryEdge {
  readonly direction: 'incoming' | 'outgoing';
  readonly from: string;
  readonly to: string;
}

export interface ModuleSummary {
  readonly path: string;
  readonly label: string;
  readonly layer: string;
  readonly description?: string;
  readonly files: readonly string[];
  readonly boundaryEdges: readonly ModuleBoundaryEdge[];
  readonly rules?: ReportModuleRules;
  readonly violationCount: number;
  readonly warningCount: number;
  readonly cycle?: ModuleCycle;
}

export interface ModuleCycle {
  readonly modulePaths: readonly string[];
}

export interface ModuleLayerSummary {
  readonly name: string;
  readonly paths: readonly string[];
  readonly graphs: readonly string[];
  readonly modulePaths: readonly string[];
  readonly totalFiles: number;
  readonly coveredFiles: number;
}

export interface LaymosModulesModel {
  readonly report: LaymosReport;
  readonly modules: ReadonlyMap<string, ModuleSummary>;
  readonly layers: ReadonlyMap<string, ModuleLayerSummary>;
  readonly observedEdges: readonly ObservedModuleEdge[];
  readonly observedEdgeByKey: ReadonlyMap<string, ObservedModuleEdge>;
  readonly successors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly predecessors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly cycles: readonly ModuleCycle[];
}

export function moduleEdgeKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

function normalize(path: string): string {
  return path.replace(/\/+$/, '');
}

function contains(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

function layerForModule(report: LaymosReport, modulePath: string): string {
  const fileLayer = Object.values(report.files).find(
    (file) => file.kind === 'covered' && file.module === modulePath,
  );
  if (fileLayer?.kind === 'covered') return fileLayer.layer;

  let best: { name: string; path: string } | undefined;
  for (const [name, layer] of Object.entries(report.architecture.layers)) {
    for (const path of layer.paths) {
      const normalized = normalize(path);
      if (
        contains(normalized, modulePath) &&
        (!best || normalized.length > best.path.length)
      ) {
        best = { name, path: normalized };
      }
    }
  }
  return best?.name ?? '';
}

function labelForModule(
  report: LaymosReport,
  modulePath: string,
  layer: string,
): string {
  const layerPaths = report.architecture.layers[layer]?.paths ?? [];
  const owner = layerPaths
    .map(normalize)
    .filter((path) => contains(path, modulePath))
    .sort((left, right) => right.length - left.length)[0];
  if (!owner) return modulePath;
  if (owner === modulePath) return modulePath.split('/').at(-1) ?? modulePath;
  return modulePath.slice(owner.length + 1);
}

function findModuleCycles(
  modulePaths: readonly string[],
  successors: ReadonlyMap<string, ReadonlySet<string>>,
): readonly ModuleCycle[] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: ModuleCycle[] = [];

  const visit = (path: string): void => {
    const index = nextIndex;
    nextIndex += 1;
    indices.set(path, index);
    lowLinks.set(path, index);
    stack.push(path);
    onStack.add(path);

    for (const successor of successors.get(path) ?? []) {
      if (!indices.has(successor)) {
        visit(successor);
        lowLinks.set(
          path,
          Math.min(lowLinks.get(path)!, lowLinks.get(successor)!),
        );
      } else if (onStack.has(successor)) {
        lowLinks.set(
          path,
          Math.min(lowLinks.get(path)!, indices.get(successor)!),
        );
      }
    }

    if (lowLinks.get(path) !== indices.get(path)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== path);
    if (component.length > 1) {
      cycles.push({ modulePaths: component.sort() });
    }
  };

  for (const path of modulePaths) {
    if (!indices.has(path)) visit(path);
  }
  return cycles.sort((left, right) =>
    left.modulePaths[0]!.localeCompare(right.modulePaths[0]!),
  );
}

/** Builds the private query model for the module visualization. */
export function buildLaymosModulesModel(
  report: LaymosReport,
): LaymosModulesModel {
  const modulePaths = Object.keys(report.architecture.modules);
  const modulePathSet = new Set(modulePaths);
  const filesByModule = new Map(
    modulePaths.map((path) => [path, [] as string[]]),
  );
  for (const [path, file] of Object.entries(report.files)) {
    if (
      file.kind === 'covered' &&
      file.module &&
      modulePathSet.has(file.module)
    ) {
      filesByModule.get(file.module)!.push(path);
    }
  }

  const violatingFileEdges = new Set(
    report.violations
      .filter((violation) => violation.kind === 'module')
      .map((violation) =>
        moduleEdgeKey(violation.from.file, violation.to.file),
      ),
  );
  const edgeMap = new Map<
    string,
    { from: string; to: string; fileEdges: ModuleFileEdge[] }
  >();
  const boundaryByModule = new Map(
    modulePaths.map((path) => [path, [] as ModuleBoundaryEdge[]]),
  );

  for (const [fromPath, fromFile] of Object.entries(report.files)) {
    if (fromFile.kind !== 'covered') continue;
    for (const toPath of fromFile.imports) {
      const toFile = report.files[toPath];
      if (toFile?.kind !== 'covered') continue;
      const fromModule = fromFile.module;
      const toModule = toFile.module;
      if (fromModule && toModule && fromModule !== toModule) {
        if (!modulePathSet.has(fromModule) || !modulePathSet.has(toModule)) {
          continue;
        }
        const key = moduleEdgeKey(fromModule, toModule);
        const edge = edgeMap.get(key) ?? {
          from: fromModule,
          to: toModule,
          fileEdges: [],
        };
        edge.fileEdges.push({
          from: fromPath,
          to: toPath,
          violating: violatingFileEdges.has(moduleEdgeKey(fromPath, toPath)),
        });
        edgeMap.set(key, edge);
      } else if (fromModule && modulePathSet.has(fromModule) && !toModule) {
        boundaryByModule.get(fromModule)!.push({
          direction: 'outgoing',
          from: fromPath,
          to: toPath,
        });
      } else if (!fromModule && toModule && modulePathSet.has(toModule)) {
        boundaryByModule.get(toModule)!.push({
          direction: 'incoming',
          from: fromPath,
          to: toPath,
        });
      }
    }
  }

  const observedEdges = [...edgeMap.values()]
    .map(
      (edge): ObservedModuleEdge => ({
        ...edge,
        violating: edge.fileEdges.some((fileEdge) => fileEdge.violating),
      }),
    )
    .sort((left, right) =>
      moduleEdgeKey(left.from, left.to).localeCompare(
        moduleEdgeKey(right.from, right.to),
      ),
    );
  const successors = new Map<string, Set<string>>(
    modulePaths.map((path) => [path, new Set()]),
  );
  const predecessors = new Map<string, Set<string>>(
    modulePaths.map((path) => [path, new Set()]),
  );
  for (const edge of observedEdges) {
    successors.get(edge.from)?.add(edge.to);
    predecessors.get(edge.to)?.add(edge.from);
  }
  const cycles = findModuleCycles(modulePaths, successors);
  const cycleByModule = new Map(
    cycles.flatMap((cycle) =>
      cycle.modulePaths.map((path) => [path, cycle] as const),
    ),
  );

  const rulesByModule = new Map(
    report.architecture.moduleRules.map((rules) => [rules.module, rules]),
  );
  const violationCountByModule = new Map<string, number>();
  for (const violation of report.violations) {
    if (violation.kind !== 'module') continue;
    violationCountByModule.set(
      violation.from.module,
      (violationCountByModule.get(violation.from.module) ?? 0) + 1,
    );
    if (violation.to.module !== violation.from.module) {
      violationCountByModule.set(
        violation.to.module,
        (violationCountByModule.get(violation.to.module) ?? 0) + 1,
      );
    }
  }

  const modules = new Map<string, ModuleSummary>();
  for (const [path, architectureModule] of Object.entries(
    report.architecture.modules,
  )) {
    const layer = layerForModule(report, path);
    modules.set(path, {
      path,
      layer,
      label: labelForModule(report, path, layer),
      files: (filesByModule.get(path) ?? []).sort(),
      boundaryEdges: boundaryByModule.get(path) ?? [],
      violationCount: violationCountByModule.get(path) ?? 0,
      warningCount: cycleByModule.has(path) ? 1 : 0,
      ...(cycleByModule.get(path) !== undefined
        ? { cycle: cycleByModule.get(path) }
        : {}),
      ...(architectureModule.description !== undefined
        ? { description: architectureModule.description }
        : {}),
      ...(rulesByModule.get(path) !== undefined
        ? { rules: rulesByModule.get(path) }
        : {}),
    });
  }

  const graphsByLayer = new Map<string, string[]>();
  for (const graph of report.architecture.graphs) {
    for (const layer of graph.layers) {
      graphsByLayer.set(layer, [
        ...(graphsByLayer.get(layer) ?? []),
        graph.name,
      ]);
    }
  }
  const coverageByLayer = new Map(
    report.coverage.modules.map((coverage) => [coverage.layer, coverage]),
  );
  const layers = new Map<string, ModuleLayerSummary>();
  for (const [name, layer] of Object.entries(report.architecture.layers)) {
    const coverage = coverageByLayer.get(name);
    layers.set(name, {
      name,
      paths: layer.paths,
      graphs: graphsByLayer.get(name) ?? [],
      modulePaths: [...modules.values()]
        .filter((module) => module.layer === name)
        .map((module) => module.path),
      totalFiles: coverage?.totalFiles ?? 0,
      coveredFiles: coverage?.coveredFiles ?? 0,
    });
  }

  return {
    report,
    modules,
    layers,
    observedEdges,
    observedEdgeByKey: new Map(
      observedEdges.map((edge) => [moduleEdgeKey(edge.from, edge.to), edge]),
    ),
    successors,
    predecessors,
    cycles,
  };
}
