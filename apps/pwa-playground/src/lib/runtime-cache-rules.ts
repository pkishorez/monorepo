// Runtime Cache rules for the playground's API endpoints. First match wins,
// and user rules run before the preset's, so the catch-all goes last.
export const TIME_STRATEGIES = [
  'network-first',
  'cache-first',
  'stale-while-revalidate',
  'network-only',
] as const;

export type TimeStrategy = (typeof TIME_STRATEGIES)[number];

export const timeUrl = (strategy: TimeStrategy): string =>
  `/api/time/${strategy}`;

export const runtimeCache = [
  ...TIME_STRATEGIES.map((strategy) => ({
    match: { origin: 'same-origin', pathPrefix: timeUrl(strategy) },
    strategy,
    cacheName: `time-${strategy}`,
    ...(strategy === 'network-first' ? { networkTimeoutMs: 2000 } : {}),
  })),
  {
    match: { origin: 'same-origin', pathPrefix: '/api/data' },
    strategy: 'network-first' as const,
    cacheName: 'data',
    networkTimeoutMs: 2000,
  },
  // Would cache /api/auth/session too, if neverCache ('/api/auth/') did not
  // take it out first. The auth-sim page proves it does.
  {
    match: { origin: 'same-origin', pathPrefix: '/api/' },
    strategy: 'network-first' as const,
    cacheName: 'api',
  },
];
