import {
  feature,
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const server = layer('server', ['src/server.ts', 'src/durable-objects']);
const entrypoints = layer('entrypoints', ['src/router.tsx']);
const routes = layer('routes', ['src/routes', 'src/docs']);
const components = layer('components', ['src/components']);
const services = layer('services', ['src/services']);
const lib = layer('lib', ['src/lib']);

const blog = feature('blog', [
  'src/routes/blog',
  'src/components/blog',
  'src/components/code-block',
]);

const docs = feature('docs', ['src/routes/docs', 'src/docs']);

const otel = feature('otel', ['src/routes/otel']);

const depCruiser = feature('dep-cruiser', ['src/routes/dep-cruiser']);

const dev = feature('dev', ['src/routes/dev']);

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
  features: [blog, docs, otel, depCruiser, dev],
} satisfies ProjectConfig;
