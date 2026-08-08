import type { Config, ConfigValidationIssue } from '../../project-config.js';

export function findUnknownReferences(
  layers: Config['layers'],
  layerGraphs: Config['layerGraphs'],
): readonly ConfigValidationIssue[] {
  const known = new Set(Object.keys(layers));
  const issues: ConfigValidationIssue[] = [];

  for (const [graph, { rules }] of Object.entries(layerGraphs)) {
    for (const [from, destinations] of Object.entries(rules)) {
      if (!known.has(from)) issues.push(referenceIssue(graph, from));
      for (const to of destinations) {
        if (!known.has(to)) issues.push(referenceIssue(graph, to));
      }
    }
  }

  return [...new Map(issues.map((issue) => [issue.message, issue])).values()];
}

function referenceIssue(graph: string, layer: string): ConfigValidationIssue {
  return {
    kind: 'reference',
    message: `LayerGraph ${graph} references unknown Layer ${layer}`,
  };
}
