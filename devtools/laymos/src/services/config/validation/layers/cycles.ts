import type { Config } from '../../config.js';
import type { ConfigValidationIssue } from '../../errors.js';

export function findCycles(
  layerGraphs: Config['layerGraphs'],
): readonly ConfigValidationIssue[] {
  const graph = combineRules(layerGraphs);
  return stronglyConnectedComponents(graph)
    .filter(
      (component) =>
        component.length > 1 || graph.get(component[0]!)?.has(component[0]!),
    )
    .map((component) => ({
      kind: 'cycle' as const,
      message: `Layer rule cycle includes: ${component.sort().join(', ')}`,
    }));
}

function combineRules(
  layerGraphs: Config['layerGraphs'],
): ReadonlyMap<string, ReadonlySet<string>> {
  const graph = new Map<string, Set<string>>();
  for (const { rules } of Object.values(layerGraphs)) {
    for (const [from, destinations] of Object.entries(rules)) {
      const edges = graph.get(from) ?? new Set<string>();
      graph.set(from, edges);
      for (const to of destinations) {
        edges.add(to);
        if (!graph.has(to)) graph.set(to, new Set());
      }
    }
  }
  return graph;
}

function stronglyConnectedComponents(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    const index = nextIndex;
    nextIndex += 1;
    indices.set(node, index);
    lowLinks.set(node, index);
    stack.push(node);
    onStack.add(node);

    for (const destination of graph.get(node) ?? []) {
      if (!indices.has(destination)) {
        visit(destination);
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node)!, lowLinks.get(destination)!),
        );
      } else if (onStack.has(destination)) {
        lowLinks.set(
          node,
          Math.min(lowLinks.get(node)!, indices.get(destination)!),
        );
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    let member: string;
    do {
      member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    components.push(component);
  };

  for (const node of graph.keys()) {
    if (!indices.has(node)) visit(node);
  }

  return components;
}
