import type { LayerDefinition } from './layers.js';

export function assignFilesToLayers(
  files: Iterable<string>,
  layers: Readonly<Record<string, LayerDefinition>>,
): ReadonlyMap<string, string> {
  const membership = new Map<string, string>();
  const entries = Object.entries(layers).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const file of files) {
    const layer = entries.find(([, definition]) =>
      definition.paths.some((scope) => contains(scope, file)),
    )?.[0];
    if (layer !== undefined) membership.set(file, layer);
  }

  return membership;
}

function contains(scope: string, file: string): boolean {
  return scope === '.' || file === scope || file.startsWith(`${scope}/`);
}
