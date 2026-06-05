import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const cli = layer('cli', ['src/cli'], {
  description: 'CLI entry, command wiring, config loading',
});

const core = layer('core', ['src/authoring', 'src/compile', 'src/analyze'], {
  description: 'Pure config DSL, compilation and analysis',
});

const types = layer('types', ['src/types.ts'], {
  description: 'Shared type foundation',
});

const authoring = feature('authoring', {
  description: 'Public config DSL builders',
});
const compile = feature('compile', {
  description:
    'Config → dependency-cruiser/visualization config + ordering validation',
});
const analyze = feature('analyze', {
  description: 'Post-cruise result summarisation',
});

export default {
  rootDir: 'src',
  ignore: ['src/index.ts'],
  rules: [layersTopDown('depcruise-viz', [cli, core, types])],
  features: [authoring, compile, analyze],
  modules: [
    module('src/authoring', { feature: 'authoring', visibility: 'public' }),
    module('src/compile', { feature: 'compile', visibility: 'public' }),
    module('src/analyze', { feature: 'analyze', visibility: 'public' }),
  ],
} satisfies ProjectConfig;
