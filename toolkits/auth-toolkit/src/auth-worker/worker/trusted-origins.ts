const escapeRegExp = (value: string) =>
  value.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&');

const USAGE =
  'expected a full origin (e.g. "https://app.example.com"), a host pattern (e.g. "*.example.com"), or an app scheme and path (e.g. "ledger://oauth")';

const parse = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isWeb = (url: URL) =>
  url.protocol === 'https:' || url.protocol === 'http:';

const hasWildcard = (pattern: string) =>
  pattern.includes('*') || pattern.includes('?');

const invalid = (pattern: string) =>
  new Error(`Invalid trustedOrigins pattern "${pattern}": ${USAGE}.`);

const validateTrustedOrigin = (pattern: string) => {
  if (!hasWildcard(pattern)) {
    if (parse(pattern) === null) throw invalid(pattern);
    return;
  }

  const probe = pattern.replaceAll('*', 'x').replaceAll('?', 'x');
  const hasScheme = probe.includes('://');
  const url = parse(hasScheme ? probe : `https://${probe}`);
  const isBareOrigin =
    url !== null && url.pathname === '/' && !url.search && !url.hash;
  const hostMatches = hasScheme || url?.host === probe;
  if (url === null || !isWeb(url) || !isBareOrigin || !hostMatches) {
    throw invalid(pattern);
  }
};

/** An app's own scheme has no origin (`URL.origin` is "null" for every one
 * of them), so it is matched by scheme and path instead: `ledger://` trusts
 * the whole scheme, `ledger://oauth` that path and below. */
const matchesAppScheme = (value: string, pattern: URL) => {
  const url = parse(value);
  if (url === null || url.protocol !== pattern.protocol) return false;
  const trusted = `${pattern.host}${pattern.pathname}`.replace(/\/$/, '');
  const given = `${url.host}${url.pathname}`;
  return trusted === '' || given === trusted || given.startsWith(`${trusted}/`);
};

const matchesTrustedOrigin = (origin: string, pattern: string) => {
  if (!hasWildcard(pattern)) {
    const url = new URL(pattern);
    return isWeb(url) ? url.origin === origin : matchesAppScheme(origin, url);
  }

  let value = origin;
  if (!pattern.includes('://')) {
    const url = parse(origin);
    if (url === null || url.protocol !== 'https:') return false;
    value = url.host;
  }
  const source = escapeRegExp(pattern)
    .replaceAll('\\*', '.*')
    .replaceAll('\\?', '.');
  return new RegExp(`^${source}$`, 'i').test(value);
};

export const validateTrustedOrigins = (patterns: ReadonlyArray<string>) =>
  patterns.forEach(validateTrustedOrigin);

/** Whether `origin` (an `Origin` header, or an app's redirect) is trusted.
 * The opaque origin "null" never is. */
export const isTrustedOrigin = (
  origin: string,
  patterns: ReadonlyArray<string>,
) =>
  origin !== 'null' &&
  patterns.some((pattern) => matchesTrustedOrigin(origin, pattern));
