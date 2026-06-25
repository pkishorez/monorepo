import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const composites = layer('composites', ['src/components/blocks', 'src/form'], {
  description: 'Domain widgets and the form kit',
});

const ui = layer('ui', ['src/components/ui'], {
  description: 'shadcn presentational primitives',
});

const foundation = layer('foundation', ['src/lib', 'src/hooks'], {
  description: 'Framework-agnostic helpers and hooks',
});

const dependencyCruiserViz = feature('dependency-cruiser-viz', {
  description: 'Dependency-cruiser layer/feature/module visualization',
});
const otelTraceViewer = feature('otel-trace-viewer', {
  description: 'OpenTelemetry trace viewer',
});
const hello = feature('hello', {
  description: 'Minimal example block',
});

export default {
  rootDir: 'src',
  ignore: ['src/css.d.ts', 'src/cosmos.decorator.tsx', 'src/styles'],
  rules: [layersTopDown('frontend', [composites, ui, foundation])],
  features: [dependencyCruiserViz, otelTraceViewer, hello],
  modules: [
    module('src/components/blocks/dependency-cruiser-viz', {
      feature: 'dependency-cruiser-viz',
      visibility: 'public',
    }),
    module('src/components/blocks/dependency-cruiser-viz/files', {
      feature: 'dependency-cruiser-viz',
    }),
    module('src/components/blocks/dependency-cruiser-viz/graph', {
      feature: 'dependency-cruiser-viz',
    }),
    module('src/components/blocks/otel-trace-viewer', {
      feature: 'otel-trace-viewer',
      visibility: 'public',
    }),
  ],
} satisfies ProjectConfig;
