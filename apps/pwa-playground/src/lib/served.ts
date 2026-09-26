/** What the playground's API endpoints return, plus how the tab got it. */
export interface Served {
  readonly servedAt: string;
  readonly status: number;
  /** The worker answered with a saved copy (it stamps those when saving). */
  readonly fromCache: boolean;
  readonly error: string | null;
  readonly body: unknown;
}

// pwa-toolkit adds this header to every copy it saves in a Runtime Cache,
// so only a cached answer carries it.
const CACHED_AT_HEADER = 'x-pwa-toolkit-cached-at';

/** Fetches `url` and reports its `x-served-at` stamp and whether it was cached. */
export const servedFetch = async (
  url: string,
  init?: RequestInit,
): Promise<Served> => {
  try {
    const response = await fetch(url, init);
    const servedAt = response.headers.get('x-served-at') ?? '';
    const fromCache = response.headers.has(CACHED_AT_HEADER);
    const body: unknown = await response.json().catch(() => null);
    return { servedAt, status: response.status, fromCache, error: null, body };
  } catch (error) {
    return {
      servedAt: '',
      status: 0,
      fromCache: false,
      error: error instanceof Error ? error.message : String(error),
      body: null,
    };
  }
};

export const servedHeaders = (): HeadersInit => ({
  'x-served-at': `${new Date().toISOString()}#${crypto.randomUUID().slice(0, 8)}`,
  'cache-control': 'no-store',
});
