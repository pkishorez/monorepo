import type { Plugin } from 'vite';
import { VIRTUAL_CLIENT_MODULE_ID } from '../../shared/build/index.js';
import type { ResolvedPwaConfig } from '../../shared/config/index.js';
import type { BuildState } from '../build/index.js';
import { type BuildVersion, resolveBuildVersion } from './build-version.js';
import { clientBuildInfo } from './client-info.js';

const RESOLVED_ID = `\0${VIRTUAL_CLIENT_MODULE_ID}`;
const PACKAGE = '@kstackz/pwa-toolkit';

/**
 * Serves `virtual:pwa-toolkit/client` to the client and server environments,
 * and keeps `@kstackz/pwa-toolkit` inside Vite's module graph there (not pre-bundled,
 * not externalized) so its import of the virtual module resolves.
 */
export const clientModulePlugin = (
  config: ResolvedPwaConfig,
  state: BuildState,
): Plugin => {
  let version: BuildVersion | undefined;
  return {
    name: 'pwa-toolkit:client-module',
    enforce: 'pre',
    sharedDuringBuild: true,
    configResolved(resolved) {
      version ??= resolveBuildVersion(config, resolved.root);
    },
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
      if (
        !serving &&
        consumer === 'server' &&
        config.enabled &&
        !state.buildId
      ) {
        this.warn(
          'the server environment built before the client environment, so pages carry no Build ID',
        );
      }
      const info = clientBuildInfo(config, {
        serving,
        consumer,
        buildId: state.buildId,
        version: version ?? resolveBuildVersion(config, process.cwd()),
      });
      return `export default ${JSON.stringify(info)};\n`;
    },
  };
};
