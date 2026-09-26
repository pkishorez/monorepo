// Stands in for `virtual:pwa-toolkit/client` in unit tests.
import type { ClientBuildInfo } from '../src/domain/config/index.js';

const info: ClientBuildInfo = {
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { mode: 'prompt', checkIntervalMinutes: 60 },
  buildId: null,
  manifestUrl: '/manifest.webmanifest',
  themeColor: null,
  appleTouchIconUrl: null,
};

export default info;
