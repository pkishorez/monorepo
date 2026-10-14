/*
 * Static pages kept in the Cloudflare Cache, under a key with the build id,
 * so each is drawn once per deploy per data center. The first drawing is kept
 * before it is sent, so the next request finds it, and goes out with the
 * same Cache-Control as when it was drawn. Where there is no Cache,
 * as in dev or in Node, every page is drawn.
 */

interface Kept {
  readonly match: (key: Request) => Promise<Response | undefined>;
  readonly put: (key: Request, response: Response) => Promise<void>;
}

const theCache = (): Kept | undefined =>
  (globalThis as { caches?: { default?: Kept } }).caches?.default;

/** The page at `url` for this build: from the Cache if it is there, else drawn and, if it may be `shared`, put there. */
export const kept = async (
  shared: string,
  build: string,
  url: URL,
  draw: () => Promise<Response>,
): Promise<Response> => {
  const cache = theCache();
  if (!cache) return draw();
  const key = new Request(
    `${url.origin}/_kabuki/cache/${encodeURIComponent(build)}${url.pathname}${url.search}`,
  );
  const hit = await cache.match(key);
  // A zone's Browser Cache TTL raises the max-age of what comes out of the
  // Cache: the browser must still ask again, so a deploy is seen at once.
  if (hit) {
    const response = new Response(hit.body, hit);
    response.headers.set('cache-control', shared);
    return response;
  }
  const response = await draw();
  if (response.headers.get('cache-control') !== shared) return response;
  await cache.put(key, response.clone());
  return response;
};
