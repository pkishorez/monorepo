import type { ProjectConfig } from './src/types.js';
import { layer, layersTopDown } from './src/index.js';

const cli = layer('cli', ['src/cli']);
const lib = layer('lib', [
  'src/index.ts',
  'src/layer.ts',
  'src/layers-top-down.ts',
  'src/summarize-cruise-result.ts',
  'src/to-dependency-cruiser-config.ts',
  'src/to-visualization-config.ts',
  'src/types.ts',
]);

export default {
  rootDir: 'src',
  rules: [layersTopDown('dependency-cruiser-viz', [cli, lib])],
} satisfies ProjectConfig;
