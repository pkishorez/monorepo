import { DEFAULT_THEME, isTheme, THEME_COOKIE, type Theme } from './model.ts';

export const themeFromCookies = (cookies: string | null | undefined): Theme => {
  for (const part of (cookies ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== THEME_COOKIE) continue;
    const value = decodeURIComponent(rest.join('='));
    return isTheme(value) ? value : DEFAULT_THEME;
  }
  return DEFAULT_THEME;
};

export const writeThemeCookie = (theme: Theme, cookieDomain?: string): void => {
  const domain = cookieDomain?.replace(/^\./, '').trim();
  const shared =
    domain &&
    (location.hostname === domain || location.hostname.endsWith(`.${domain}`))
      ? `; Domain=${domain}`
      : '';
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${shared}${secure}`;
};
