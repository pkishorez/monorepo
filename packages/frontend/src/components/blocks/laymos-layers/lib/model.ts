import type { LaymosReport, ReportGraph, ReportLayerEdge } from 'laymos/report';

import type { LaymosNode } from '../types';

export interface FileEdge {
  readonly from: string;
  readonly to: string;
}

export interface ObservedLayerEdge {
  readonly from: string;
  readonly to: string;
  readonly fileEdges: readonly FileEdge[];
  readonly violating: boolean;
}

export interface LayerSummary {
  readonly name: string;
  readonly description?: string;
  readonly paths: readonly string[];
  readonly graphs: readonly string[];
  readonly fileCount: number;
  readonly moduleCoveredFiles: number;
  readonly moduleTotalFiles: number;
  readonly incomingViolationCount: number;
  readonly outgoingViolationCount: number;
}

export interface LaymosLayersModel {
  readonly report: LaymosReport;
  readonly layers: ReadonlyMap<string, LayerSummary>;
  readonly graphByName: ReadonlyMap<string, ReportGraph>;
  readonly configuredEdgeKeys: ReadonlySet<string>;
  readonly configuredEdges: readonly (ReportLayerEdge & {
    readonly graph: string;
  })[];
  readonly displayConfiguredEdges: readonly (ReportLayerEdge & {
    readonly graph: string;
  })[];
  readonly observedEdges: readonly ObservedLayerEdge[];
  readonly observedEdgeByKey: ReadonlyMap<string, ObservedLayerEdge>;
  readonly successors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly predecessors: ReadonlyMap<string, ReadonlySet<string>>;
  readonly ranks: ReadonlyMap<string, number>;
}

export function edgeKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

function reachable(
  start: string,
  target: string,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  ignoredEdge?: string,
): boolean {
  const pending = [start];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target && current !== start) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (edgeKey(current, next) !== ignoredEdge) pending.push(next);
    }
  }
  return false;
}

function adjacencyForGraph(graph: ReportGraph): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const layer of graph.layers) adjacency.set(layer, new Set());
  for (const edge of graph.edges) adjacency.get(edge.from)?.add(edge.to);
  return adjacency;
}

function reduceGraphEdges(graph: ReportGraph): ReportLayerEdge[] {
  const adjacency = adjacencyForGraph(graph);
  return graph.edges.filter(
    (edge) =>
      !reachable(edge.from, edge.to, adjacency, edgeKey(edge.from, edge.to)),
  );
}

function computeRanks(
  layers: readonly string[],
  predecessors: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const rank = (layer: string): number => {
    const existing = ranks.get(layer);
    if (existing !== undefined) return existing;
    const incoming = predecessors.get(layer) ?? new Set<string>();
    const value =
      incoming.size === 0
        ? 0
        : Math.max(...[...incoming].map((parent) => rank(parent))) + 1;
    ranks.set(layer, value);
    return value;
  };
  for (const layer of layers) rank(layer);
  return ranks;
}

function buildObservedEdges(report: LaymosReport): ObservedLayerEdge[] {
  const fileEdgesByLayerPair = new Map<string, FileEdge[]>();
  for (const [fromPath, fromFile] of Object.entries(report.files)) {
    if (fromFile.kind !== 'covered') continue;
    for (const toPath of fromFile.imports) {
      const toFile = report.files[toPath];
      if (toFile?.kind !== 'covered' || fromFile.layer === toFile.layer) {
        continue;
      }
      const key = edgeKey(fromFile.layer, toFile.layer);
      const edges = fileEdgesByLayerPair.get(key) ?? [];
      edges.push({ from: fromPath, to: toPath });
      fileEdgesByLayerPair.set(key, edges);
    }
  }

  const violatingPairs = new Set(
    report.violations
      .filter((violation) => violation.kind === 'layer')
      .map((violation) => edgeKey(violation.from.layer, violation.to.layer)),
  );

  return [...fileEdgesByLayerPair.entries()].map(([key, fileEdges]) => {
    const separator = key.indexOf('\0');
    return {
      from: key.slice(0, separator),
      to: key.slice(separator + 1),
      fileEdges,
      violating: violatingPairs.has(key),
    };
  });
}

/** Builds the small query model used by layout and contextual disclosure. */
export function buildLaymosLayersModel(
  report: LaymosReport,
): LaymosLayersModel {
  const graphByName = new Map(
    report.architecture.graphs.map((graph) => [graph.name, graph]),
  );
  const graphMemberships = new Map<string, string[]>();
  const configuredEdges = report.architecture.graphs.flatMap((graph) => {
    for (const layer of graph.layers) {
      const graphs = graphMemberships.get(layer) ?? [];
      graphs.push(graph.name);
      graphMemberships.set(layer, graphs);
    }
    return graph.edges.map((edge) => ({ ...edge, graph: graph.name }));
  });
  const displayConfiguredEdges = report.architecture.graphs.flatMap((graph) =>
    reduceGraphEdges(graph).map((edge) => ({ ...edge, graph: graph.name })),
  );

  const successors = new Map<string, Set<string>>();
  const predecessors = new Map<string, Set<string>>();
  for (const layer of Object.keys(report.architecture.layers)) {
    successors.set(layer, new Set());
    predecessors.set(layer, new Set());
  }
  for (const edge of configuredEdges) {
    successors.get(edge.from)?.add(edge.to);
    predecessors.get(edge.to)?.add(edge.from);
  }

  const fileCount = new Map<string, number>();
  for (const file of Object.values(report.files)) {
    if (file.kind !== 'covered') continue;
    fileCount.set(file.layer, (fileCount.get(file.layer) ?? 0) + 1);
  }
  const moduleCoverage = new Map(
    report.coverage.modules.map((coverage) => [coverage.layer, coverage]),
  );
  const incomingViolations = new Map<string, number>();
  const outgoingViolations = new Map<string, number>();
  for (const violation of report.violations) {
    if (violation.kind !== 'layer') continue;
    outgoingViolations.set(
      violation.from.layer,
      (outgoingViolations.get(violation.from.layer) ?? 0) + 1,
    );
    incomingViolations.set(
      violation.to.layer,
      (incomingViolations.get(violation.to.layer) ?? 0) + 1,
    );
  }

  const layers = new Map<string, LayerSummary>();
  for (const [name, layer] of Object.entries(report.architecture.layers)) {
    const coverage = moduleCoverage.get(name);
    layers.set(name, {
      name,
      paths: layer.paths,
      graphs: graphMemberships.get(name) ?? [],
      fileCount: fileCount.get(name) ?? 0,
      moduleCoveredFiles: coverage?.coveredFiles ?? 0,
      moduleTotalFiles: coverage?.totalFiles ?? fileCount.get(name) ?? 0,
      incomingViolationCount: incomingViolations.get(name) ?? 0,
      outgoingViolationCount: outgoingViolations.get(name) ?? 0,
      ...(layer.description !== undefined
        ? { description: layer.description }
        : {}),
    });
  }

  const observedEdges = buildObservedEdges(report);
  return {
    report,
    layers,
    graphByName,
    configuredEdgeKeys: new Set(
      configuredEdges.map((edge) => edgeKey(edge.from, edge.to)),
    ),
    configuredEdges,
    displayConfiguredEdges,
    observedEdges,
    observedEdgeByKey: new Map(
      observedEdges.map((edge) => [edgeKey(edge.from, edge.to), edge]),
    ),
    successors,
    predecessors,
    ranks: computeRanks([...layers.keys()], predecessors),
  };
}

export function hasConfiguredEdge(
  model: LaymosLayersModel,
  from: string,
  to: string,
): boolean {
  return model.configuredEdgeKeys.has(edgeKey(from, to));
}

export function hasObservedEdge(
  model: LaymosLayersModel,
  from: string,
  to: string,
): boolean {
  return model.observedEdgeByKey.has(edgeKey(from, to));
}

export interface ActiveModel {
  readonly node: LaymosNode | null;
  readonly visibleObservedEdges: ReadonlySet<string>;
  readonly relatedLayers: ReadonlySet<string>;
  readonly incomingLayers: ReadonlySet<string>;
  readonly outgoingLayers: ReadonlySet<string>;
  readonly activeGraphs: ReadonlySet<string>;
}

/** Derives the graph disclosure state from the externally controlled node. */
export function getActiveModel(
  model: LaymosLayersModel,
  node: LaymosNode | null,
): ActiveModel {
  if (!node) {
    return {
      node,
      visibleObservedEdges: new Set(),
      relatedLayers: new Set(),
      incomingLayers: new Set(),
      outgoingLayers: new Set(),
      activeGraphs: new Set(),
    };
  }

  if (node.kind === 'graph') {
    const graph = model.graphByName.get(node.name);
    if (!graph) return getActiveModel(model, null);
    const graphLayers = new Set(graph.layers);
    const visibleObservedEdges = new Set(
      model.observedEdges
        .filter(
          (edge) =>
            (graphLayers.has(edge.from) && graphLayers.has(edge.to)) ||
            (edge.violating &&
              (graphLayers.has(edge.from) || graphLayers.has(edge.to))),
        )
        .map((edge) => edgeKey(edge.from, edge.to)),
    );
    const relatedLayers = new Set(graph.layers);
    for (const edge of model.observedEdges) {
      if (!visibleObservedEdges.has(edgeKey(edge.from, edge.to))) continue;
      relatedLayers.add(edge.from);
      relatedLayers.add(edge.to);
    }
    return {
      node,
      visibleObservedEdges,
      relatedLayers,
      incomingLayers: new Set(),
      outgoingLayers: new Set(),
      activeGraphs: new Set([node.name]),
    };
  }

  if (!model.layers.has(node.name)) return getActiveModel(model, null);
  const incomingLayers = new Set<string>();
  const outgoingLayers = new Set<string>();
  for (const edge of model.displayConfiguredEdges) {
    if (edge.to === node.name) incomingLayers.add(edge.from);
    if (edge.from === node.name) outgoingLayers.add(edge.to);
  }
  const relatedLayers = new Set([
    node.name,
    ...incomingLayers,
    ...outgoingLayers,
  ]);
  const visibleObservedEdges = new Set<string>();
  for (const edge of model.observedEdges) {
    if (edge.from !== node.name && edge.to !== node.name) continue;
    visibleObservedEdges.add(edgeKey(edge.from, edge.to));
    relatedLayers.add(edge.from);
    relatedLayers.add(edge.to);
    if (edge.to === node.name) incomingLayers.add(edge.from);
    if (edge.from === node.name) outgoingLayers.add(edge.to);
  }
  return {
    node,
    visibleObservedEdges,
    relatedLayers,
    incomingLayers,
    outgoingLayers,
    activeGraphs: new Set(model.layers.get(node.name)?.graphs ?? []),
  };
}
