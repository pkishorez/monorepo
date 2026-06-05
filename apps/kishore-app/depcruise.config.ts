import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const server = layer('server', ['src/server.ts', 'src/durable-objects'], {
  description: 'Worker entry and durable objects',
});

const entrypoints = layer('entrypoints', ['src/router.tsx'], {
  description: 'Client/server router bootstrap',
});

const routes = layer('routes', ['src/routes', 'src/docs'], {
  description: 'File-based route tree and per-route UI',
});

const components = layer('components', ['src/components'], {
  description: 'Shared presentational components',
});

const services = layer('services', ['src/services'], {
  description: 'Runtime services (rollup bundling, app runtime)',
});

const lib = layer('lib', ['src/lib'], {
  description: 'Framework-agnostic helpers',
});

const blog = feature('blog', { description: 'Blog index and per-slug posts' });
const docs = feature('docs', { description: 'Package documentation routes' });
const otel = feature('otel', { description: 'OpenTelemetry trace viewer' });
const depCruiser = feature('dep-cruiser', {
  description: 'Dependency cruiser visualization route',
});
const dev = feature('dev', { description: 'Internal dev/playground routes' });
const codeBlock = feature('code-block', {
  description: 'Syntax-highlighted code block component, shared with blog',
});
const rollup = feature('rollup', {
  description: 'In-browser rollup bundling service',
});

export default {
  rootDir: 'src',
  ignore: ['src/styles.css', 'src/routeTree.gen.ts', 'src/types.d.ts'],
  rules: [
    layersTopDown('app', [
      server,
      entrypoints,
      routes,
      components,
      services,
      lib,
    ]),
  ],
  features: [blog, docs, otel, depCruiser, dev, codeBlock, rollup],
  modules: [
    module('src/routes/blog', { feature: 'blog' }),
    module('src/routes/docs', { feature: 'docs' }),
    module('src/routes/otel', { feature: 'otel' }),
    module('src/routes/otel/internal', { feature: 'otel' }),
    module('src/routes/dev', { feature: 'dev' }),
    module('src/routes/dev/components', { feature: 'dev' }),
    module('src/routes/dep-cruiser', { feature: 'dep-cruiser' }),
    module('src/components/blog', { feature: 'blog' }),
    module('src/components/code-block', {
      feature: 'code-block',
      visibility: 'shared',
      sharedWith: ['blog'],
    }),
    module('src/services/rollup', { feature: 'rollup' }),
  ],
} satisfies ProjectConfig;
