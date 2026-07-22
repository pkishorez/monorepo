import type { LaymosReport, ReportGraph } from 'laymos/report';

export interface ModuleFileEdge {
  readonly from: string;
  readonly to: string;
  readonly violating: boolean;
}

export interface ModuleEdge {
  readonly from: string;
  readonly to: string;
  readonly fileEdges: readonly ModuleFileEdge[];
  readonly violating: boolean;
}

export interface ModuleSummary {
  readonly path: string;
  readonly label: string;
  readonly isRoot: boolean;
  readonly isSink: boolean;
  readonly description?: string;
  readonly layer: string;
  readonly graphs: readonly string[];
  readonly files: readonly string[];
  readonly violationCount: number;
}

export interface LayerSummary {
  readonly name: string;
  readonly description?: string;
  readonly graphs: readonly string[];
  readonly modulePaths: readonly string[];
  readonly fileCount: number;
  readonly coveredFiles: number;
  readonly totalFiles: number;
  readonly violationCount: number;
}

export interface ModuleGraphModel {
  readonly report: LaymosReport;
  readonly graphs: readonly ReportGraph[];
  readonly modules: ReadonlyMap<string, ModuleSummary>;
  readonly layers: ReadonlyMap<string, LayerSummary>;
  readonly edges: readonly ModuleEdge[];
  readonly edgeByKey: ReadonlyMap<string, ModuleEdge>;
  readonly successors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly predecessors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly layerRanks: ReadonlyMap<string, number>;
}

export function moduleEdgeKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

function belongsTo(path: string, prefix: string): boolean {
  const normalized = prefix.replace(/\/$/, '');
  return path === normalized || path.startsWith(`${normalized}/`);
}

function layerForModule(
  report: LaymosReport,
  modulePath: string,
  files: readonly string[],
): string {
  for (const filePath of files) {
    const file = report.files[filePath];
    if (file?.kind === 'covered') return file.layer;
  }
  const candidates = Object.entries(report.architecture.layers)
    .flatMap(([name, layer]) =>
      layer.paths
        .filter((path) => belongsTo(modulePath, path))
        .map((path) => ({ name, length: path.length })),
    )
    .sort((left, right) => right.length - left.length);
  return candidates[0]?.name ?? 'unassigned';
}

function shortestLabels(paths: readonly string[]): Map<string, string> {
  const segments = new Map(
    paths.map((path) => [path, path.split('/').filter(Boolean)]),
  );
  const labels = new Map<string, string>();
  for (const path of paths) {
    const parts = segments.get(path)!;
    let length = 1;
    while (length < parts.length) {
      const suffix = parts.slice(-length).join('/');
      const unique = paths.every(
        (other) =>
          other === path ||
          segments.get(other)!.slice(-length).join('/') !== suffix,
      );
      if (unique) break;
      length += 1;
    }
    labels.set(path, parts.slice(-length).join('/') || path);
  }
  return labels;
}

function computeLayerRanks(
  layerNames: readonly string[],
  graphs: readonly ReportGraph[],
): Map<string, number> {
  const outgoing = new Map(layerNames.map((name) => [name, new Set<string>()]));
  const incoming = new Map(layerNames.map((name) => [name, 0]));
  for (const graph of graphs) {
    for (const edge of graph.edges) {
      if (outgoing.get(edge.from)?.has(edge.to)) continue;
      outgoing.get(edge.from)?.add(edge.to);
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }
  }
  const ranks = new Map(layerNames.map((name) => [name, 0]));
  const queue = layerNames.filter((name) => incoming.get(name) === 0);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const next of outgoing.get(current) ?? []) {
      ranks.set(next, Math.max(ranks.get(next) ?? 0, ranks.get(current)! + 1));
      const remaining = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  return ranks;
}

/** Builds the data model for the independently implemented module graph. */
export function buildModuleGraphModel(report: LaymosReport): ModuleGraphModel {
  const modulePaths = Object.keys(report.architecture.modules).sort();
  const modulePathSet = new Set(modulePaths);
  const filesByModule = new Map(
    modulePaths.map((path) => [path, [] as string[]]),
  );
  for (const [path, file] of Object.entries(report.files)) {
    if (
      file.kind === 'covered' &&
      file.module &&
      filesByModule.has(file.module)
    ) {
      filesByModule.get(file.module)!.push(path);
    }
  }
  for (const files of filesByModule.values()) files.sort();

  const labels = shortestLabels(modulePaths);
  const graphsByLayer = new Map<string, string[]>();
  for (const graph of report.architecture.graphs) {
    for (const layer of graph.layers) {
      const graphs = graphsByLayer.get(layer) ?? [];
      graphs.push(graph.name);
      graphsByLayer.set(layer, graphs);
    }
  }

  const violatingFileEdges = new Set(
    report.violations
      .filter((violation) => violation.kind === 'module')
      .map((violation) =>
        moduleEdgeKey(violation.from.file, violation.to.file),
      ),
  );
  const edgeFiles = new Map<string, ModuleFileEdge[]>();
  for (const [fromFilePath, fromFile] of Object.entries(report.files)) {
    if (fromFile.kind !== 'covered' || !fromFile.module) continue;
    for (const toFilePath of fromFile.imports) {
      const toFile = report.files[toFilePath];
      if (
        toFile?.kind !== 'covered' ||
        !toFile.module ||
        fromFile.module === toFile.module ||
        !modulePathSet.has(fromFile.module) ||
        !modulePathSet.has(toFile.module)
      ) {
        continue;
      }
      const key = moduleEdgeKey(fromFile.module, toFile.module);
      const files = edgeFiles.get(key) ?? [];
      files.push({
        from: fromFilePath,
        to: toFilePath,
        violating: violatingFileEdges.has(
          moduleEdgeKey(fromFilePath, toFilePath),
        ),
      });
      edgeFiles.set(key, files);
    }
  }

  const edges = [...edgeFiles.entries()]
    .map(([key, fileEdges]): ModuleEdge => {
      const separator = key.indexOf('\0');
      return {
        from: key.slice(0, separator),
        to: key.slice(separator + 1),
        fileEdges,
        violating: fileEdges.some((edge) => edge.violating),
      };
    })
    .sort((left, right) =>
      moduleEdgeKey(left.from, left.to).localeCompare(
        moduleEdgeKey(right.from, right.to),
      ),
    );

  const incidentViolations = new Map(modulePaths.map((path) => [path, 0]));
  for (const edge of edges) {
    const violationCount = edge.fileEdges.filter(
      (fileEdge) => fileEdge.violating,
    ).length;
    if (violationCount === 0) continue;
    incidentViolations.set(
      edge.from,
      (incidentViolations.get(edge.from) ?? 0) + violationCount,
    );
    incidentViolations.set(
      edge.to,
      (incidentViolations.get(edge.to) ?? 0) + violationCount,
    );
  }

  const modulesWithIncoming = new Set(edges.map((edge) => edge.to));
  const modulesWithOutgoing = new Set(edges.map((edge) => edge.from));

  const modules = new Map<string, ModuleSummary>();
  for (const path of modulePaths) {
    const files = filesByModule.get(path)!;
    const layer = layerForModule(report, path, files);
    const configured = report.architecture.modules[path];
    modules.set(path, {
      path,
      label: labels.get(path)!,
      isRoot: !modulesWithIncoming.has(path),
      isSink: !modulesWithOutgoing.has(path),
      layer,
      graphs: graphsByLayer.get(layer) ?? [],
      files,
      violationCount: incidentViolations.get(path) ?? 0,
      ...(configured?.description !== undefined
        ? { description: configured.description }
        : {}),
    });
  }

  const layerNames = [
    ...new Set([
      ...Object.keys(report.architecture.layers),
      ...[...modules.values()].map((module) => module.layer),
    ]),
  ];
  const coverageByLayer = new Map(
    report.coverage.modules.map((coverage) => [coverage.layer, coverage]),
  );
  const layers = new Map<string, LayerSummary>();
  for (const name of layerNames) {
    const configured = report.architecture.layers[name];
    const modulePathsInLayer = [...modules.values()]
      .filter((module) => module.layer === name)
      .map((module) => module.path)
      .sort();
    const coverage = coverageByLayer.get(name);
    const layerFiles = Object.values(report.files).filter(
      (file) => file.kind === 'covered' && file.layer === name,
    ).length;
    layers.set(name, {
      name,
      graphs: graphsByLayer.get(name) ?? [],
      modulePaths: modulePathsInLayer,
      fileCount: layerFiles,
      coveredFiles: coverage?.coveredFiles ?? modulePathsInLayer.length,
      totalFiles: coverage?.totalFiles ?? layerFiles,
      violationCount: modulePathsInLayer.reduce(
        (total, path) => total + (modules.get(path)?.violationCount ?? 0),
        0,
      ),
      ...(configured?.description !== undefined
        ? { description: configured.description }
        : {}),
    });
  }

  const successors = new Map(
    modulePaths.map((path) => [path, new Set<string>()]),
  );
  const predecessors = new Map(
    modulePaths.map((path) => [path, new Set<string>()]),
  );
  for (const edge of edges) {
    successors.get(edge.from)?.add(edge.to);
    predecessors.get(edge.to)?.add(edge.from);
  }

  return {
    report,
    graphs: report.architecture.graphs,
    modules,
    layers,
    edges,
    edgeByKey: new Map(
      edges.map((edge) => [moduleEdgeKey(edge.from, edge.to), edge]),
    ),
    successors,
    predecessors,
    layerRanks: computeLayerRanks(layerNames, report.architecture.graphs),
  };
}
