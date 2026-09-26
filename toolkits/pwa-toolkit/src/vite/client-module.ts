import type { Plugin } from 'vite';
import { VIRTUAL_CLIENT_MODULE_ID } from '../domain/build/index.js';
import type { ResolvedPwaConfig } from '../domain/config/index.js';
import type { BuildState } from './build-state.js';
import { clientBuildInfo } from './client-info.js';

const RESOLVED_ID = `\0${VIRTUAL_CLIENT_MODULE_ID}`;
const PACKAGE = 'pwa-toolkit';

/**
 * Serves `virtual:pwa-toolkit/client` to the client and server environments,
 * and keeps `pwa-toolkit` inside Vite's module graph there (not pre-bundled,
 * not externalized) so its import of the virtual module resolves.
 */
export const clientModulePlugin = (
  config: ResolvedPwaConfig,
  state: BuildState,
): Plugin => ({
  name: 'pwa-toolkit:client-module',
  enforce: 'pre',
  sharedDuringBuild: true,
  configEnvironment(name, environment) {
    const consumer =
      environment.consumer ?? (name === 'client' ? 'client' : 'server');
    return consumer === 'client'
      ? { optimizeDeps: { exclude: [PACKAGE] } }
      : { resolve: { noExternal: [PACKAGE] } };
  },
  resolveId(id) {
    return id === VIRTUAL_CLIENT_MODULE_ID ? RESOLVED_ID : undefined;
  },
  load(id) {
    if (id !== RESOLVED_ID) return undefined;
    const { command, consumer } = this.environment.config;
    const serving = command === 'serve';
    if (!serving && consumer === 'server' && config.enabled && !state.buildId) {
      this.warn(
        'the server environment built before the client environment, so pages carry no Build ID',
      );
    }
    const info = clientBuildInfo(config, {
      serving,
      consumer,
      buildId: state.buildId,
    });
    return `export default ${JSON.stringify(info)};\n`;
  },
});
