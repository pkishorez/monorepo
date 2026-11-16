import type { StrategyRule } from './strategy/index.js';

export const PRESET_NAMES = ['app', 'content'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

interface Preset {
  readonly strategies: ReadonlyArray<StrategyRule>;
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * The Static Data: what Kabuki Start's build kept of each static place, the same
 * for everyone and under its build id, so a file there never changes. The
 * worker keeps each one it has fetched and never asks again, so a static
 * page opens whole in the App Shell, offline too. A newer build's files
 * are other URLs; an older build's fall out, the oldest first. The path is
 * written here rather than imported, so the worker carries none of Start.
 */
const DATA: StrategyRule = {
  match: { origin: 'same-origin', pathPrefix: '/_kabuki/data/' },
  strategy: 'cache-first',
  cacheName: 'data',
  maxEntries: 500,
};

/**
 * `app` for signed-in dashboards and tools, `content` for docs and content
 * sites. Images are left out of the Precache, so every preset caches them
 * at runtime, and every preset keeps the Static Data. How pages work offline is no
 * preset's business: every page is the App Shell.
 */
export const PRESETS: Record<PresetName, Preset> = {
  app: {
    strategies: [
      DATA,
      {
        match: { origin: 'same-origin', destination: ['image'] },
        strategy: 'cache-first',
        cacheName: 'images',
        maxEntries: 200,
        maxAgeSeconds: 30 * DAY_SECONDS,
      },
    ],
  },
  content: {
    strategies: [
      DATA,
      {
        match: { origin: 'same-origin', destination: ['image'] },
        strategy: 'stale-while-revalidate',
        cacheName: 'images',
        maxEntries: 300,
        maxAgeSeconds: 30 * DAY_SECONDS,
      },
    ],
  },
};
