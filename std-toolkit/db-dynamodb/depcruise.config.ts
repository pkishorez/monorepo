import {
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

const entrypoint = layer('entrypoint', ['src/index.ts']);
const rpc = layer('rpc', ['src/rpc']);
const services = layer('services', ['src/services']);
const expr = layer('expr', ['src/expr']);
const internal = layer('internal', ['src/internal']);
const generated = layer('generated', ['src/generated']);
const types = layer('types', ['src/types']);
const errors = layer('errors', ['src/errors.ts']);

const tests = layer('tests', [
  'src/__tests__',
  'src/expr/__tests__',
  'src/internal/__tests__',
]);
const play = layer('play', ['src/play']);

const production = [
  entrypoint,
  rpc,
  services,
  expr,
  internal,
  generated,
  types,
  errors,
];

export default {
  rootDir: 'src',
  ignore: ['**/__tests__/**'],
  rules: [
    layersTopDown('production', production),
    layersTopDown('tests', [tests, ...production]),
    layersTopDown('play', [play, ...production]),
  ],
} satisfies ProjectConfig;
