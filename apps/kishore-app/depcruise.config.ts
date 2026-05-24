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
  'src/routes/blog/index.tsx',
  'src/routes/blog/_slug.tsx',
  'src/routes/blog/_slug/effect-all/index.tsx',
  'src/routes/blog/_slug/fiber-part-1/index.tsx',
  'src/routes/blog/_slug/fiber-part-2/index.tsx',
  'src/routes/blog/_slug/fiber-part-3/index.tsx',
  'src/routes/blog/_slug/fiber-part-4/index.tsx',
]);

const docs = feature('docs', [
  'src/routes/docs/index.tsx',
  'src/routes/docs/$pkg.tsx',
]);

const otel = feature('otel', ['src/routes/otel/index.tsx']);

const depCruiser = feature('dep-cruiser', ['src/routes/dep-cruiser/index.tsx']);

const dev = feature('dev', [
  'src/routes/dev/index.tsx',
  'src/routes/dev/forms.tsx',
  'src/routes/dev/ui.tsx',
]);

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
