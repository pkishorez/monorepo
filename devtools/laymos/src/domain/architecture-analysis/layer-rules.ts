import type { Config } from '../project-config/index.js';

export function combineLayerRules(
  config: Config,
): Readonly<Record<string, readonly string[]>> {
  const rules = new Map<string, Set<string>>();
  for (const { rules: graphRules } of Object.values(config.layerGraphs)) {
    for (const [from, destinations] of Object.entries(graphRules)) {
      const combined = rules.get(from) ?? new Set<string>();
      rules.set(from, combined);
      for (const to of destinations) combined.add(to);
    }
  }
  return Object.fromEntries(
    [...rules.entries()].map(([from, destinations]) => [
      from,
      [...destinations],
    ]),
  );
}
