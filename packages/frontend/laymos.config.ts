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
    layerGraph('frontend', [edge(composites, ui), edge(ui, foundation)], {
      description: 'Frontend component architecture',
    }),
  ],
  modules: [
    module('src/components/blocks/file-tree', {
      description: 'File tree block',
    }),
    module('src/components/blocks/hello.tsx', {
      description: 'Hello block',
    }),
    module('src/components/blocks/json', { description: 'JSON block' }),
    module('src/components/blocks/laymos-layers', {
      description: 'Laymos Layers block',
    }),
    module('src/components/blocks/laymos-modules', {
      description: 'Laymos Modules block',
    }),
    module('src/components/blocks/laymos-tests', {
      description: 'Laymos Tests block',
    }),
    module('src/components/blocks/otel-trace-viewer', {
      description: 'OpenTelemetry trace viewer block',
    }),
    module('src/components/blocks/sequence', {
      description: 'Sequence block',
    }),
    module('src/components/blocks/swim-lane', {
      description: 'Swim lane block',
    }),
    module('src/components/blocks/tanstack-sync-devtools', {
      description: 'TanStack Sync Devtools block',
    }),
    module('src/components/ui', { description: 'UI primitives' }),
    module('src/form', { description: 'Form kit' }),
    module('src/hooks', { description: 'Shared hooks' }),
    module('src/lib', { description: 'Shared helpers' }),
  ],
});
