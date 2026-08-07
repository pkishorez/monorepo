export type AllowedDependencies = ReadonlyMap<string, ReadonlySet<string>>;

export function buildAllowedDependencies(
  rules: Readonly<Record<string, readonly string[]>>,
): AllowedDependencies {
  const allowed = new Map<string, ReadonlySet<string>>();
  const destinations = (layer: string, visited: ReadonlySet<string>) => {
    const reachable = new Set<string>();
    for (const destination of rules[layer] ?? []) {
      if (visited.has(destination)) continue;
      reachable.add(destination);
      const nextVisited = new Set(visited).add(destination);
      for (const indirect of destinations(destination, nextVisited)) {
        reachable.add(indirect);
      }
    }
    return reachable;
  };

  for (const layer of Object.keys(rules)) {
    allowed.set(layer, destinations(layer, new Set([layer])));
  }
  return allowed;
}
