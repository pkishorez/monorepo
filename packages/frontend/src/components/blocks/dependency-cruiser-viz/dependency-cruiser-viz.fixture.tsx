import {
  layer,
  layersTopDown,
  toVisualizationConfig,
} from 'dependency-cruiser-viz';

import { DependencyCruiserViz } from './dependency-cruiser-viz';

const domainLayer = layer('domain', ['src/domain']);

const backend = layersTopDown('backend', [
  layer('server', ['src/server'], {
    description: 'HTTP handlers & entry point',
  }),
  layer('orchestrator', ['src/orchestrator']),
  layer('services', ['src/services']),
  domainLayer,
]);

const frontend = layersTopDown('frontend', [
  layer('routes', ['src/routes'], { description: 'Page-level UI components' }),
  domainLayer,
]);

const simpleConfig = toVisualizationConfig([
  layersTopDown('app', [layer('ui', ['src/ui']), layer('core', ['src/core'])]),
]);

const fullConfig = toVisualizationConfig([backend, frontend]);

const dbLayer = layer('database', ['src/database']);
const configLayer = layer('config', ['src/config']);
const utilsLayer = layer('utils', ['src/utils']);

const api = layersTopDown('api', [
  layer('gateway', ['src/gateway']),
  layer('middleware', ['src/middleware']),
  layer('controllers', ['src/controllers']),
  layer('services', ['src/services']),
  layer('repositories', ['src/repositories']),
  dbLayer,
  configLayer,
]);

const web = layersTopDown('web', [
  layer('pages', ['src/pages']),
  layer('components', ['src/components']),
  layer('hooks', ['src/hooks']),
  layer('state', ['src/state']),
  utilsLayer,
  configLayer,
]);

const worker = layersTopDown('worker', [
  layer('scheduler', ['src/scheduler']),
  layer('jobs', ['src/jobs']),
  layer('queues', ['src/queues']),
  dbLayer,
  configLayer,
]);

const cli = layersTopDown('cli', [
  layer('commands', ['src/commands']),
  layer('prompts', ['src/prompts']),
  utilsLayer,
  configLayer,
]);

const complexConfig = toVisualizationConfig([api, web, worker, cli]);

export default {
  simple: <DependencyCruiserViz config={simpleConfig} />,
  full: <DependencyCruiserViz config={fullConfig} />,
  complex: <DependencyCruiserViz config={complexConfig} />,
};
