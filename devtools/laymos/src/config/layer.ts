import type { Layer } from './types.js';

export function layer(
  name: string,
  paths: readonly string[],
  options: { readonly description: string },
): Layer {
  return {
    kind: 'layer',
    name,
    paths,
    description: options.description,
  };
}
