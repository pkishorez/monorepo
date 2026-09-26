import type { Plugin } from 'vite';
import { VIRTUAL_BUILD_MODULE_ID } from '../../domain/build/index.js';
import type { WorkerBuildInfo } from '../../domain/config/index.js';
import { DEFAULT_ENTRY_ID, DEFAULT_ENTRY_SOURCE } from './entry.js';

const resolved = (id: string) => `\0${id}`;

/**
 * Serves the worker bundle's virtual modules: `virtual:pwa-toolkit/build`
 * with the WorkerBuildInfo inlined, and the built-in entry.
 */
export const buildModulePlugin = (info: WorkerBuildInfo): Plugin => ({
  name: 'pwa-toolkit:worker-build-module',
  enforce: 'pre',
  resolveId(id) {
    if (id === VIRTUAL_BUILD_MODULE_ID || id === DEFAULT_ENTRY_ID) {
      return resolved(id);
    }
    return undefined;
  },
  load(id) {
    if (id === resolved(VIRTUAL_BUILD_MODULE_ID)) {
      return `export default ${JSON.stringify(info)};\n`;
    }
    if (id === resolved(DEFAULT_ENTRY_ID)) return DEFAULT_ENTRY_SOURCE;
    return undefined;
  },
});
