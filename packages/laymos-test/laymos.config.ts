import { defineConfig, edge, layer, layerGraph, module } from 'laymos';

const workflows = layer('workflows', ['src'], {
  description: 'Production workflows exercised by the end-to-end Stories',
});

const tests = layer('tests', ['test'], {
  description: 'Integration checks for Story discovery and execution',
});

export default defineConfig({
  sourceRoots: ['src', 'test'],
  graphs: [
    layerGraph('laymos-test', [edge(tests, workflows)], {
      description: 'End-to-end Story execution against production workflows',
    }),
  ],
  modules: [
    module('src', {
      description: 'Example workflows and their owned Story surface',
    }),
  ],
});
