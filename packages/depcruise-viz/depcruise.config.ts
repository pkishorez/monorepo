import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

// cli layer includes cruise: both are wiring/integration code, not domain logic.
const cli = layer('cli', ['src/cli', 'src/cruise'], {
  description:
    'CLI entry, command wiring, config loading, cruise orchestration',
});

const core = layer('core', ['src/authoring', 'src/compile', 'src/analyze'], {
  description: 'Pure config DSL, compilation and analysis',
});

const types = layer('types', ['src/types.ts'], {
  description: 'Shared type foundation',
});

// types.ts is shared: named by all three features (emergent — no marker on the module).
// The module name is "types.ts" because the module is declared at the layer's own path
// (src/types.ts == layer path), so the name falls back to the basename.
const authoring = feature('authoring', {
  root: 'authoring',
  modules: ['authoring', 'types.ts'],
  description: 'Public config DSL builders',
});
const compile = feature('compile', {
  root: 'compile',
  modules: ['compile', 'types.ts'],
  description:
    'Config → dependency-cruiser/visualization config + ordering validation',
});
const analyze = feature('analyze', {
  root: 'analyze',
  modules: ['analyze', 'types.ts'],
  description: 'Post-cruise result summarisation',
});

export default {
  rootDir: 'src',
  // src/index.ts and src/node.ts are package-entry re-export barrels; not domain modules.
  ignore: ['src/index.ts', 'src/node.ts'],
  rules: [layersTopDown('depcruise-viz', [cli, core, types])],
  features: [authoring, compile, analyze],
  modules: [
    module('src/authoring'),
    module('src/compile'),
    module('src/analyze'),
    // types is shared by all three features — emergent sharing, no marker needed.
    module('src/types.ts'),
    // cli and cruise are wiring barrels: their out-edges are exempt from closure.
    module('src/cli', { barrel: true }),
    module('src/cruise', { barrel: true }),
  ],
} satisfies ProjectConfig;
