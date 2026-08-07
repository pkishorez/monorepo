export function findModuleCycles(
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): readonly (readonly string[])[] {
  const indexByModule = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let index = 0;

  const visit = (module: string) => {
    indexByModule.set(module, index);
    lowLink.set(module, index);
    index += 1;
    stack.push(module);
    onStack.add(module);

    for (const target of [...(edges.get(module) ?? [])].sort()) {
      if (!indexByModule.has(target)) {
        visit(target);
        lowLink.set(
          module,
          Math.min(lowLink.get(module)!, lowLink.get(target)!),
        );
      } else if (onStack.has(target)) {
        lowLink.set(
          module,
          Math.min(lowLink.get(module)!, indexByModule.get(target)!),
        );
      }
    }

    if (lowLink.get(module) !== indexByModule.get(module)) return;
    const component: string[] = [];
    let current: string;
    do {
      current = stack.pop()!;
      onStack.delete(current);
      component.push(current);
    } while (current !== module);
    if (component.length > 1) cycles.push(component.sort());
  };

  const modules = new Set(edges.keys());
  for (const destinations of edges.values()) {
    for (const destination of destinations) modules.add(destination);
  }
  for (const module of [...modules].sort()) {
    if (!indexByModule.has(module)) visit(module);
  }
  return cycles.sort(([left = ''], [right = '']) => left.localeCompare(right));
}
