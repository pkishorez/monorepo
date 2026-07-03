import {
  feature,
  layer,
  layersTopDown,
  module,
  type ProjectConfig,
} from 'depcruise-viz';

const server = layer('server', ['src/server.ts', 'src/durable-objects'], {
  description: 'Worker entry and durable objects',
});

const entrypoints = layer('entrypoints', ['src/router.tsx'], {
  description: 'Client/server router bootstrap',
});

const routes = layer('routes', ['src/routes'], {
  description: 'File-based route tree and per-route UI',
});

const components = layer('components', ['src/components'], {
  description: 'Shared presentational components',
});

const lib = layer('lib', ['src/lib'], {
  description: 'Framework-agnostic helpers',
});

export default {
  rootDir: 'src',
  ignore: ['src/styles.css', 'src/routeTree.gen.ts', 'src/types.d.ts'],
  rules: [layersTopDown('app', [server, entrypoints, routes, components, lib])],
  features: [
    feature('devtools', {
      root: 'devtools',
      modules: ['devtools', 'devtools/internal'],
      description: 'DevTools workbench (OTel traces and dependency graphs)',
    }),
    feature('dev', {
      root: 'dev',
      modules: ['dev', 'dev/components'],
      description: 'Internal dev/playground routes',
    }),
  ],
  modules: [
    module('src/routes/devtools'),
    module('src/routes/devtools/internal'),
    module('src/routes/dev'),
    module('src/routes/dev/components'),
  ],
} satisfies ProjectConfig;
