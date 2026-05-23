import type { Layer, LayerStack, LayerStackConfig } from './types.js';

export function layersTopDown(
  name: string,
  layers: Layer[],
  config?: LayerStackConfig,
): LayerStack {
  if (name.length === 0) {
    throw new Error('Stack name must not be empty');
  }
  if (layers.length < 2) {
    throw new Error(`Stack "${name}" must have at least 2 layers`);
  }

  const seen = new Map<string, Layer>();
  for (const l of layers) {
    const existing = seen.get(l.name);
    if (existing && existing !== l) {
      throw new Error(
        `Stack "${name}" has duplicate layer name "${l.name}" with different definitions`,
      );
    }
    seen.set(l.name, l);
  }

  return { kind: 'layer-stack', name, layers, config: config ?? {} };
}
