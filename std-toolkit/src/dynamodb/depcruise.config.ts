import {
  layer,
  layersTopDown,
  type ProjectConfig,
} from 'dependency-cruiser-viz';

// What this package exposes: the entity/command surface consumers drive.
// rpc handlers live here too — they're an internal detail of the commands,
// not a layer of their own.
const services = layer('services', ['src/services', 'src/rpc']);

// Expression builders, exposed for callers writing conditions/updates.
const expr = layer('expr', ['src/expr']);

// --- Internals below: not part of the public surface ---

const internal = layer('internal', ['src/internal']);
const generated = layer('generated', ['src/generated']);
const types = layer('types', ['src/types']);
const errors = layer('errors', ['src/errors.ts']);

export default {
  rootDir: 'src',
  // index.ts is just the barrel; tests and play scripts are not architecture.
  ignore: ['**/__tests__/**', 'src/play/**', 'src/index.ts'],
  rules: [
    layersTopDown('architecture', [
      services,
      expr,
      internal,
      generated,
      types,
      errors,
    ]),
  ],
} satisfies ProjectConfig;
