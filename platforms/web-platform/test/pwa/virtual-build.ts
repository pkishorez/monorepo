// Stands in for `virtual:pwa-toolkit/build` in unit tests.
import { BuildId } from '../../src/pwa/engine/contract/build/index.js';
import {
  resolvePwaConfig,
  type WorkerBuildInfo,
  workerConfigOf,
} from '../../src/pwa/engine/contract/config/index.js';

const info: WorkerBuildInfo = {
  buildId: BuildId.make('test-build'),
  precache: [{ url: '/assets/app.js', revision: 'app-1' }],
  config: workerConfigOf(resolvePwaConfig({ name: 'App' })),
};

export default info;
