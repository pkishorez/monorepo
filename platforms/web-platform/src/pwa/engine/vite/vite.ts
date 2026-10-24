import * as Schema from 'effect/Schema';
import type { Plugin } from 'vite';
import { PwaOptions, resolvePwaConfig } from '../shared/config/index.js';
import { buildPlugin, makeBuildState } from './build/index.js';
import { clientModulePlugin } from './client-module/index.js';
import { devPlugin } from './dev/index.js';

/**
 * Turns a Kabuki Start app into a PWA: its manifest, and its worker,
 * written beside the client's files once Start has built both sides.
 * Start draws every page on request, so the Offline Fallback is the app's
 * own `public/offline.html`. Invalid options throw here, at config time.
 */
export const pwa = (options: PwaOptions = {}): Plugin[] => {
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
