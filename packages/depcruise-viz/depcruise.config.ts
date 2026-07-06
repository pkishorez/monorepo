import {
  edge,
  layer,
  layerGraph,
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

export default {
  rootDir: 'src',
  // src/index.ts and src/node.ts are package-entry re-export barrels; not domain modules.
  ignore: ['src/index.ts', 'src/node.ts'],
  rules: [layerGraph('depcruise-viz', [edge(cli, core), edge(core, types)])],
  modules: [
    module('src/authoring'),
    module('src/compile'),
    module('src/analyze'),
    module('src/types.ts'),
    // cli and cruise are wiring: treated as opaque leaves.
    module('src/cli', { opaque: true }),
    module('src/cruise', { opaque: true }),
  ],
} satisfies ProjectConfig;
