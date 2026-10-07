import type { StrategyRule } from '../strategy/index.js';

export const PRESET_NAMES = ['app', 'content'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

interface Preset {
  readonly strategies: ReadonlyArray<StrategyRule>;
  readonly navigation: {
    readonly shell: boolean;
    readonly cachePages: boolean;
  };
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * `app` for signed-in dashboards and tools, `content` for docs and content
 * sites (settled from the playground's lifecycle runs). Images are left out of the Precache, so every preset caches them at runtime.
 */
export const PRESETS: Record<PresetName, Preset> = {
  app: {
    strategies: [
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
    strategies: [
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
