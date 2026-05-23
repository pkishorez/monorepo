import { layer, layersTopDown } from './src/index.js';

const cli = layer('cli', ['src/cli']);
const lib = layer('lib', [
  'src/index.ts',
  'src/layer.ts',
  'src/layers-top-down.ts',
  'src/to-dependency-cruiser-config.ts',
  'src/to-visualization-config.ts',
  'src/types.ts',
]);

export default [layersTopDown('dependency-cruiser-viz', [cli, lib])];
