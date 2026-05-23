import type { Rule, VisualizationConfig } from './types.js';

export function toVisualizationConfig(rules: Rule[]): VisualizationConfig {
  const stacks: VisualizationConfig['stacks'] = [];

  for (const rule of rules) {
    const { layers } = rule;
    const allowedImports: Array<{ from: string; to: string }> = [];

    for (let i = 0; i < layers.length; i++) {
      const upper = layers[i]!;
      for (let j = i + 1; j < layers.length; j++) {
        const lower = layers[j]!;
        allowedImports.push({ from: upper.name, to: lower.name });
      }
    }

    const stack: VisualizationConfig['stacks'][number] = {
      name: rule.name,
      layers: layers.map((l) => {
        const entry: VisualizationConfig['stacks'][number]['layers'][number] = {
          name: l.name,
          paths: [...l.paths],
        };
        if (l.config.description !== undefined) {
          entry.description = l.config.description;
        }
        return entry;
      }),
      allowedImports,
    };
    if (rule.config.description !== undefined) {
      stack.description = rule.config.description;
    }
    stacks.push(stack);
  }

  return { stacks };
}
