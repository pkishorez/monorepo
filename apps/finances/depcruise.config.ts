import {
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const routes = layer('routes', ['src/routes']);
const orchestration = layer('orchestration', ['src/orchestration']);
const services = layer('services', ['src/services']);
const domain = layer('domain', ['src/domain']);

const server = layer('server', ['src/server.ts', 'src/server']);

export default {
  rootDir: 'src',
  ignore: ['src/routeTree.gen.ts', 'src/styles.css', 'src/styles', '**/*.d.ts'],
  rules: [
    layersTopDown('frontend', [routes, orchestration, services, domain]),
    layersTopDown('server', [server, orchestration, services, domain]),
  ],
} satisfies ProjectConfig;
