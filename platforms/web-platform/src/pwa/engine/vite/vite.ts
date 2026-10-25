import * as Schema from 'effect/Schema';
import type { Plugin } from 'vite';
import { PwaOptions, resolvePwaConfig } from '../contract/config/index.js';
import { buildPlugin, makeBuildState } from './build/index.js';
import { clientModulePlugin } from './client-module/index.js';

export { noPwa } from './client-module/index.js';
import { devPlugin } from './dev/index.js';

/**
 * Turns a Kabuki Start app into a PWA: its manifest, and its worker,
 * written beside the client's files once Start has built both sides. The
 * worker asks Start for its Pages when it installs, so each page works
 * offline as its Render Mode says. Invalid options throw here, at config
 * time.
 */
export const pwa = (options: PwaOptions): Plugin[] => {
  const config = resolvePwaConfig(
    Schema.decodeUnknownSync(PwaOptions)(options),
  );
  const state = makeBuildState();
  return [
    clientModulePlugin(config, state),
    buildPlugin(config, state),
    devPlugin(config),
  ];
};
