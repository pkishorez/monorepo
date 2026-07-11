import {
  edge,
  layer,
  layerGraph,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

const composites = layer('composites', ['src/components/blocks', 'src/form'], {
  description: 'Domain widgets and the form kit',
});

const ui = layer('ui', ['src/components/ui'], {
  description: 'shadcn presentational primitives',
});

const foundation = layer('foundation', ['src/lib', 'src/hooks'], {
  description: 'Framework-agnostic helpers and hooks',
});

export default {
  rootDir: 'src',
  ignore: ['src/css.d.ts', 'src/cosmos.decorator.tsx', 'src/styles'],
  rules: [layerGraph('frontend', [edge(composites, ui), edge(ui, foundation)])],
  modules: [
    module('src/components/blocks/json'),
    module('src/components/blocks/swim-lane'),
    module('src/components/blocks/tanstack-sync-devtools'),
    module('src/components/blocks/dependency-cruiser-viz'),
    module('src/components/blocks/dependency-cruiser-viz/files'),
    module('src/components/blocks/dependency-cruiser-viz/graph'),
    module('src/components/blocks/otel-trace-viewer'),
  ],
} satisfies ProjectConfig;
