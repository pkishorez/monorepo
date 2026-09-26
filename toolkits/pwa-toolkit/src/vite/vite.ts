import * as Schema from 'effect/Schema';
import type { Plugin } from 'vite';
import { PwaOptions, resolvePwaConfig } from '../domain/config/index.js';
import { buildPlugin } from './build-plugin.js';
import { makeBuildState } from './build-state.js';
import { clientModulePlugin } from './client-module.js';
import { devPlugin } from './dev-plugin.js';

/**
 * Turns a TanStack Start app into a PWA. Put it after `tanstackStart()`: the
 * worker builds in a post `buildApp` hook, after the App Shell and Offline
 * Fallback are prerendered. Start's prerender options are the app's to set;
 * the build warns with the exact options when those pages are missing.
 * Invalid options throw here, at config time.
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
