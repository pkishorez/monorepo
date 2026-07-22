import { defineConfig, edge, layer, layerGraph, module } from 'laymos';

const composites = layer('composites', ['src/components/blocks', 'src/form'], {
  description: 'Domain widgets and the form kit',
});

const ui = layer('ui', ['src/components/ui'], {
  description: 'shadcn presentational primitives',
});

const foundation = layer('foundation', ['src/lib', 'src/hooks'], {
  description: 'Framework-agnostic helpers and hooks',
});

export default defineConfig({
  sourceRoots: ['src'],
  ignore: ['src/css.d.ts', 'src/cosmos.decorator.tsx', 'src/styles'],
  graphs: [
    layerGraph('frontend', [edge(composites, ui), edge(ui, foundation)]),
  ],
  modules: [
    module('src/components/blocks/file-tree'),
    module('src/components/blocks/hello.tsx'),
    module('src/components/blocks/json'),
    module('src/components/blocks/laymos-layers'),
    module('src/components/blocks/laymos-modules'),
    module('src/components/blocks/laymos-modules-view2'),
    module('src/components/blocks/laymos-stories'),
    module('src/components/blocks/otel-trace-viewer'),
    module('src/components/blocks/sequence'),
    module('src/components/blocks/swim-lane'),
    module('src/components/blocks/tanstack-sync-devtools'),
    module('src/components/ui'),
    module('src/form'),
    module('src/hooks'),
    module('src/lib'),
  ],
});
