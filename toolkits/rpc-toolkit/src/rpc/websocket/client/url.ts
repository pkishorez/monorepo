/**
 * Resolves an RPC endpoint to an absolute `ws:`/`wss:` URL.
 *
 * A relative URL is resolved against `globalThis.location` and its scheme
 * swapped (`https:` → `wss:`, otherwise `ws:`); the query is kept and the hash dropped.
 * An absolute URL is used as given, with the same scheme swap applied.
 *
 *
 * @throws if given a relative URL where there is no `location` (SSR, Workers).
 */
export const resolveUrl = (url: string): string => {
  const base = globalThis.location?.href;
  if (base === undefined && !/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    throw new Error(
      `Cannot resolve the relative RPC url ${JSON.stringify(url)}: there is ` +
        'no globalThis.location here. Pass an absolute ws:// or wss:// url.',
    );
  }

  const resolved = new URL(url, base);
  if (resolved.protocol !== 'ws:' && resolved.protocol !== 'wss:') {
    resolved.protocol = resolved.protocol === 'https:' ? 'wss:' : 'ws:';
  }
  resolved.hash = '';
  return resolved.toString();
};
