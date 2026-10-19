/** The host a cookie domain names, without its leading dot. */
const hostOf = (cookieDomain: string) =>
  cookieDomain.trim().replace(/^\./, '').toLowerCase();

/**
 * Whether `origin` (an `Origin` header) is a web page on `cookieDomain`
 * (e.g. `.example.com`) or under it: the same rule the Auth Worker trusts
 * a Browser caller by. The opaque origin `"null"` never is.
 */
export const isOriginUnder = (
  origin: string,
  cookieDomain: string,
): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const domain = hostOf(cookieDomain);
  return (
    domain !== '' &&
    (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  );
};
