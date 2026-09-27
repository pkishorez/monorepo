// Stands in for `virtual:pwa-toolkit/client` in unit tests.
import type { ClientBuildInfo } from '../src/shared/config/index.js';

const info: ClientBuildInfo = {
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { checkIntervalMinutes: 60 },
  buildId: null,
  manifestUrl: '/manifest.webmanifest',
  appleTouchIconUrl: null,
};

export default info;
