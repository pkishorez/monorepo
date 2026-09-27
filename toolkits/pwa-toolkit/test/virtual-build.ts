// Stands in for `virtual:pwa-toolkit/build` in unit tests.
import { BuildId } from '../src/shared/build/index.js';
import {
  resolvePwaConfig,
  type WorkerBuildInfo,
  workerConfigOf,
} from '../src/shared/config/index.js';

const info: WorkerBuildInfo = {
  buildId: BuildId.make('test-build'),
  precache: [
    { url: '/_shell', revision: 'shell-1' },
    { url: '/offline', revision: 'offline-1' },
  ],
  config: workerConfigOf(resolvePwaConfig({})),
};

export default info;
