import {
  isTheme,
  LEGACY_THEME_COOKIE,
  THEME_COOKIE,
  type Theme,
} from './model.ts';

const cookieValue = (
  cookies: string | null | undefined,
  name: string,
): string | undefined => {
  for (const part of (cookies ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
};

const savedIn = (cookies: string | null | undefined, name: string) => {
  const value = cookieValue(cookies, name);
  return isTheme(value) ? value : undefined;
};

/**
 * The saved Theme in a `Cookie` header string, or under the legacy name
 * when there is none under the current one; undefined before a choice is
 * saved, when the system's setting decides.
 */
export const themeFromCookies = (
  cookies: string | null | undefined,
): Theme | undefined =>
  savedIn(cookies, THEME_COOKIE) ?? savedIn(cookies, LEGACY_THEME_COOKIE);

/** Only the legacy cookie holds the choice: it is moved once. */
export const holdsLegacyOnly = (cookies: string): boolean =>
  savedIn(cookies, THEME_COOKIE) === undefined &&
  savedIn(cookies, LEGACY_THEME_COOKIE) !== undefined;

const attributes = (cookieDomain: string | undefined): string => {
  const domain = cookieDomain?.replace(/^\./, '').trim();
  const shared =
    domain &&
    (location.hostname === domain || location.hostname.endsWith(`.${domain}`))
      ? `; Domain=${domain}`
      : '';
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  return `; Path=/${shared}; SameSite=Lax${secure}`;
};

/** Saves the Theme for a year, on the Shared Cookie Domain when this host is under it. */
export const writeThemeCookie = (theme: Theme, cookieDomain?: string): void => {
  document.cookie = `${THEME_COOKIE}=${theme}; Max-Age=31536000${attributes(cookieDomain)}`;
};

/** Removes the legacy cookie, wherever it was written: the shared domain or this host. */
export const forgetLegacyCookie = (cookieDomain?: string): void => {
  document.cookie = `${LEGACY_THEME_COOKIE}=; Max-Age=0${attributes(cookieDomain)}`;
  document.cookie = `${LEGACY_THEME_COOKIE}=; Max-Age=0${attributes(undefined)}`;
};
