import { defineConfig, edge, layer, layerGraph, module } from 'laymos';

const workflows = layer('workflows', ['src'], {
  description: 'Production workflows exercised by tests',
});

const tests = layer('tests', ['test'], {
  description: 'Vitest integration checks',
});

export default defineConfig({
  sourceRoots: ['src', 'test'],
  graphs: [
    layerGraph('laymos-test', [edge(tests, workflows)], {
      description: 'Tests exercising production workflows',
    }),
  ],
  modules: [
    module('src', {
      description: 'Example workflows',
    }),
  ],
});
