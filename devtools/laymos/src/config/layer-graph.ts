import type { Layer, LayerEdge, LayerGraph } from './types.js';

export function edge(from: Layer, to: Layer): LayerEdge;
export function edge(from: Layer, to: readonly Layer[]): LayerEdge[];
export function edge(
  from: Layer,
  to: Layer | readonly Layer[],
): LayerEdge | LayerEdge[] {
  if (Array.isArray(to)) {
    return (to as readonly Layer[]).map((target) => singleEdge(from, target));
  }
  return singleEdge(from, to as Layer);
}

function singleEdge(from: Layer, to: Layer): LayerEdge {
  return { from, to };
}

export function layerGraph(
  name: string,
  edges: ReadonlyArray<LayerEdge | LayerEdge[]>,
  options: { readonly description: string },
): LayerGraph {
  const flatEdges = edges.flat();

  const layers: Layer[] = [];

  for (const e of flatEdges) {
    for (const l of [e.from, e.to]) {
      if (!layers.includes(l)) layers.push(l);
    }
  }

  return {
    kind: 'layer-graph',
    name,
    layers,
    edges: flatEdges,
    description: options.description,
  };
}
