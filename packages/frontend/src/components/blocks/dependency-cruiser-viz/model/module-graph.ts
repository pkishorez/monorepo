import { allModules, type ModuleNode } from './modules';
import type { VisualizationConfig, VizSummary } from './types';

/** An import between two of a feature's modules, by `layer::name` key. */
export type FeatureModuleGraphEdge = {
  from: string;
  to: string;
  kind: 'legal' | 'breach';
};

/**
 * The module-connection graph for a single feature: its declared member modules
 * as nodes, and the edges from `summary.featureGraphs` for that feature. Edges
 * are pre-scoped by the backend to the feature's member set and barrel-filtered —
 * the frontend consumes them directly without re-inference.
 */
export type FeatureModuleGraph = {
  nodes: ModuleNode[];
  edges: FeatureModuleGraphEdge[];
};

/**
 * Returns the feature's graph from `summary.featureGraphs`, mapping node keys
 * to full `ModuleNode` objects. Falls back to empty when the feature is not
 * found or summary is absent.
 */
export function featureModuleGraph(
  config: VisualizationConfig,
  summary: VizSummary | undefined,
  feature: string,
): FeatureModuleGraph {
  const fg = summary?.featureGraphs.find((g) => g.feature === feature);
  if (!fg || !summary) return { nodes: [], edges: [] };

  const nodeMap = new Map(allModules(config, summary).map((m) => [m.key, m]));
  const nodes = fg.nodes.flatMap((key) => {
    const m = nodeMap.get(key);
    return m ? [m] : [];
  });
  const edges: FeatureModuleGraphEdge[] = fg.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
  }));

  return { nodes, edges };
}

/**
 * The containment family of a module: its layer plus the first segment of its
 * name. `cart` and `cart/multi-reservation` in the same layer share the family
 * `layer::cart`, so the graph treats the sub-module as nested inside its parent
 * rather than as an independent peer.
 */
export function moduleFamily(layer: string, name: string): string {
  const slash = name.indexOf('/');
  return `${layer}::${slash === -1 ? name : name.slice(0, slash)}`;
}
