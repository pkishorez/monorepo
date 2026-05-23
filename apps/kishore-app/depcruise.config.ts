import {
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const routes = layer('routes', ['src/routes', 'src/docs']);
const components = layer('components', ['src/components']);
const services = layer('services', ['src/services']);
const lib = layer('lib', ['src/lib']);

export default {
  rootDir: 'src',
  ignore: ['src/styles.css'],
  rules: [layersTopDown('app', [routes, components, services, lib])],
} satisfies ProjectConfig;
