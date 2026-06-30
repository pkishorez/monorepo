import { featureFocus } from './features';
import { allModules, moduleKey, type ModuleNode } from './modules';
import type { VisualizationConfig, VizSummary } from './types';

/** An import between two of a feature's modules, by `layer::name` key. */
export type FeatureModuleGraphEdge = {
  from: string;
  to: string;
  kind: 'legal' | 'breach';
};

/**
 * The module-connection graph for a single feature: its owned ∪ consumed
 * modules as nodes, and the real module→module imports between them
 * (`summary.moduleEdges`) as edges. Edges touching a module outside the
 * feature's set are dropped, so the graph stays scoped to the feature.
 *
 * Every real import is kept (no transitive reduction): the layer-swimlane
 * layout already reads cleanly, and showing each hop is what makes the graph
 * usable as the feature's end-to-end import map. The one exception is edges
 * between a module and a sub-module nested under it (e.g. `cart` ↔
 * `cart/multi-reservation` in the same layer): that is folder containment, not
 * a dependency worth drawing, so it is suppressed and the pair is clustered
 * together in the layout instead.
 */
export type FeatureModuleGraph = {
  nodes: ModuleNode[];
  edges: FeatureModuleGraphEdge[];
};

export function featureModuleGraph(
  config: VisualizationConfig,
  summary: VizSummary | undefined,
  feature: string,
): FeatureModuleGraph {
  const focus = featureFocus(summary, feature);
  const keys = new Set([...focus.owned, ...focus.consumed]);
  const nodes = allModules(config, summary).filter((m) => keys.has(m.key));

  if (!summary) return { nodes, edges: [] };

  const seen = new Set<string>();
  const edges: FeatureModuleGraphEdge[] = [];
  for (const e of summary.moduleEdges) {
    const from = moduleKey(e.fromLayer, e.fromModule);
    const to = moduleKey(e.toLayer, e.toModule);
    if (!keys.has(from) || !keys.has(to) || from === to) continue;
    // Containment, not dependency: a module and its own nested sub-module share
    // a family and must not be wired together.
    if (
      moduleFamily(e.fromLayer, e.fromModule) ===
      moduleFamily(e.toLayer, e.toModule)
    ) {
      continue;
    }
    const id = `${from}\0${to}\0${e.kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ from, to, kind: e.kind });
  }

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
