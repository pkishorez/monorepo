import type {
  Layer,
  LayerEdge,
  LayerGraph,
  LayerGraphConfig,
} from '../types.js';

/**
 * Directed allowed-dependency edge(s): `from` may import `to`. Pass an array
 * of targets to fan out — `edge(a, [b, c])` is `[edge(a, b), edge(a, c)]`.
 */
export function edge(from: Layer, to: Layer): LayerEdge;
export function edge(from: Layer, to: readonly Layer[]): LayerEdge[];
export function edge(
  from: Layer,
  to: Layer | readonly Layer[],
): LayerEdge | LayerEdge[] {
  if (Array.isArray(to)) {
    if (to.length === 0) {
      throw new Error(`Edge from "${from.name}" must have at least 1 target`);
    }
    return (to as readonly Layer[]).map((t) => singleEdge(from, t));
  }
  return singleEdge(from, to as Layer);
}

function singleEdge(from: Layer, to: Layer): LayerEdge {
  if (from === to || from.name === to.name) {
    throw new Error(`Edge "${from.name} -> ${to.name}" is a self-edge`);
  }
  return { from, to };
}

/**
 * A DAG of layers where an import from layer A to layer B is allowed iff a
 * directed path A -> ... -> B exists (reachability is transitive). Layers with
 * no path between them in either direction are siblings: both import
 * directions are forbidden.
 */
export function layerGraph(
  name: string,
  edges: ReadonlyArray<LayerEdge | LayerEdge[]>,
  config?: LayerGraphConfig,
): LayerGraph {
  if (name.length === 0) {
    throw new Error('Graph name must not be empty');
  }
  const flatEdges = edges.flat();
  if (flatEdges.length === 0) {
    throw new Error(`Graph "${name}" must have at least 1 edge`);
  }

  const layers: Layer[] = [];
  const seen = new Map<string, Layer>();
  const seenEdges = new Set<string>();

  for (const e of flatEdges) {
    for (const l of [e.from, e.to]) {
      const existing = seen.get(l.name);
      if (existing && existing !== l) {
        throw new Error(
          `Graph "${name}" has duplicate layer name "${l.name}" with different definitions`,
        );
      }
      if (!existing) {
        seen.set(l.name, l);
        layers.push(l);
      }
    }

    const key = `${e.from.name}\0${e.to.name}`;
    if (seenEdges.has(key)) {
      throw new Error(
        `Graph "${name}" has duplicate edge "${e.from.name} -> ${e.to.name}"`,
      );
    }
    seenEdges.add(key);
  }

  return {
    kind: 'layer-graph',
    name,
    layers,
    edges: flatEdges,
    config: config ?? {},
  };
}
