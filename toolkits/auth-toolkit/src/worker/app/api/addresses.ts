/*
 * The pages' addresses, worked out purely: where a page returns to, the
 * links that keep it, and the signed query of an OAuth authorization.
 */

export const RETURN_TO = 'return_to';
export const ADD_ACCOUNT = 'add_account';

// A browser drops tabs and newlines inside a URL and reads `\\` as `/`, so
// `/\t/evil.example` leaves the origin; anything carrying them is refused.
const isUnsafe = (value: string) =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f || char === '\\';
  });

// Stands for this origin while a path is resolved; never leaves the page.
const HERE = 'https://auth.invalid';

const isUnder = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/** A path on this origin, as a browser would follow it, or undefined for
 * anything that could leave it. */
export const sameOriginPath = (value: string | null | undefined) => {
  if (!value?.startsWith('/') || value.startsWith('//')) return undefined;
  if (isUnsafe(value)) return undefined;
  const url = new URL(value, HERE);
  return url.origin === HERE ? url.pathname + url.search + url.hash : undefined;
};

/** What a page may send the browser back to beyond its own paths: an app
 * under the Shared Cookie Domain. */
export interface ReturnTrust {
  /** Without its leading dot, e.g. `example.com`. */
  readonly cookieDomain: string;
  /** The Auth Worker's own origin; http is allowed only when it is http. */
  readonly origin: string;
}

const trustedUrl = (value: string, trust: ReturnTrust) => {
  if (isUnsafe(value) || value.trim() !== value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  const protocols = new Set(['https:', new URL(trust.origin).protocol]);
  return protocols.has(url.protocol) &&
    !url.username &&
    !url.password &&
    isUnder(url.hostname, trust.cookieDomain.replace(/^\./, '').toLowerCase())
    ? url.href
    : undefined;
};

/** Where a page goes back to: its `return_to`, if it is a path on this
 * origin or, given `trust`, an app under the Shared Cookie Domain. */
export const returnDestination = (
  returnTo: string | null | undefined,
  trust?: ReturnTrust,
) =>
  sameOriginPath(returnTo) ??
  (returnTo && trust ? trustedUrl(returnTo, trust) : undefined) ??
  '/';

const withQuery = (path: string, query: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

/** The Login Screen, returning to `returnTo` once signed in. */
export const loginHref = (
  returnTo?: string,
  adding = false,
  trust?: ReturnTrust,
) => {
  const back = returnDestination(returnTo, trust);
  return withQuery('/login', {
    [ADD_ACCOUNT]: adding ? '1' : undefined,
    [RETURN_TO]: back !== '/' ? back : undefined,
  });
};

/** The Device Screen for a code, with the Account it should approve as. */
export const deviceHref = (userCode: string, account?: string) =>
  withQuery('/device', { code: userCode, account });

/**
 * The signed parameters of an OAuth authorization, as the oauth-provider
 * client sends them; undefined when the query carries none.
 */
export const signedOAuthQuery = (search: string) => {
  const params = new URLSearchParams(search);
  if (!params.has('sig')) return undefined;
  const names = new Set(params.getAll('ba_param'));
  if (names.size === 0) return undefined;
  const signed = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === 'sig' || key === 'ba_param' || names.has(key)) {
      signed.append(key, value);
    }
  }
  return signed.toString();
};
