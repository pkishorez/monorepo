import type { RuntimeCacheRule } from '../runtime-cache/index.js';

export const PRESET_NAMES = ['app', 'content'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

interface Preset {
  readonly runtimeCache: ReadonlyArray<RuntimeCacheRule>;
  readonly navigation: {
    readonly shell: boolean;
    readonly cachePages: boolean;
  };
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Provisional: the names and contents get settled from playground evidence.
 * Images are left out of the Precache, so every preset caches them at runtime.
 */
export const PRESETS: Record<PresetName, Preset> = {
  app: {
    runtimeCache: [
      {
        match: { origin: 'same-origin', destination: ['image'] },
        strategy: 'cache-first',
        cacheName: 'images',
        maxEntries: 200,
        maxAgeSeconds: 30 * DAY_SECONDS,
      },
    ],
    navigation: { shell: true, cachePages: false },
  },
  content: {
    runtimeCache: [
      {
        match: { origin: 'same-origin', destination: ['image'] },
        strategy: 'stale-while-revalidate',
        cacheName: 'images',
        maxEntries: 300,
        maxAgeSeconds: 30 * DAY_SECONDS,
      },
    ],
    navigation: { shell: false, cachePages: true },
  },
};
