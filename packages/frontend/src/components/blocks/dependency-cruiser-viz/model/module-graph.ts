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
    const id = `${from}\0${to}\0${e.kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({ from, to, kind: e.kind });
  }

  return { nodes, edges: transitivelyReduce(edges) };
}

/**
 * Drop redundant `legal` edges to declutter the graph: a direct edge u→v is
 * removed when v is already reachable from u through a longer legal path, so the
 * graph keeps the same reachability with far fewer lines (transitive reduction).
 * `breach` edges are always kept — a visibility violation is never implied by
 * another path and must stay visible.
 */
function transitivelyReduce(
  edges: FeatureModuleGraphEdge[],
): FeatureModuleGraphEdge[] {
  // Reachability is computed over legal edges only; an indirect path made of
  // legal hops is what makes a direct legal edge redundant.
  const adjacency = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.kind !== 'legal') continue;
    const out = adjacency.get(e.from) ?? new Set<string>();
    out.add(e.to);
    adjacency.set(e.from, out);
  }

  /** Can `target` be reached from `from` without taking the direct hop? */
  const reachableAvoidingDirect = (from: string, target: string): boolean => {
    // Mark `from` visited so a cycle back to it never re-expands its neighbors
    // (which would let the search sneak through the very edge we're excluding).
    const visited = new Set<string>([from]);
    const stack: string[] = [];
    for (const n of adjacency.get(from) ?? []) {
      if (n === target || visited.has(n)) continue; // skip the direct edge
      visited.add(n);
      stack.push(n);
    }
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === target) return true;
      for (const next of adjacency.get(node) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    return false;
  };

  return edges.filter((e) => {
    if (e.kind !== 'legal') return true;
    return !reachableAvoidingDirect(e.from, e.to);
  });
}
