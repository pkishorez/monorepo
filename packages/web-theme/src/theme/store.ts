import { useSyncExternalStore } from 'react';
import {
  forgetLegacyCookie,
  holdsLegacyOnly,
  themeFromCookies,
  writeThemeCookie,
} from './cookie.ts';
import {
  applyThemeToDocument,
  systemTheme,
  watchSystemTheme,
} from './document.ts';
import {
  LEGACY_THEME_COOKIE,
  THEME_CHANGED,
  THEME_COOKIE,
  type Theme,
} from './model.ts';

// What the server draws in: it can't know the system's setting, so a
// Theme read in JavaScript starts light and settles on hydration.
const SERVER_THEME: Theme = 'light';

let current: Theme = SERVER_THEME;
let listening = false;
const listeners = new Set<() => void>();

const readBrowserTheme = (): Theme =>
  themeFromCookies(document.cookie) ?? systemTheme();

const publish = (theme: Theme, freeze = false): void => {
  current = theme;
  applyThemeToDocument(theme, freeze);
  for (const listener of listeners) listener();
};

const refresh = (): void => {
  const theme = readBrowserTheme();
  if (theme !== current) publish(theme);
};

const beginListening = (cookieDomain: string | undefined): void => {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  // A choice saved under the legacy name moves to the current one, once.
  if (holdsLegacyOnly(document.cookie)) {
    const saved = themeFromCookies(document.cookie);
    if (saved !== undefined) writeThemeCookie(saved, cookieDomain);
    forgetLegacyCookie(cookieDomain);
  }
  current = readBrowserTheme();
  applyThemeToDocument(current);
  window.addEventListener(THEME_CHANGED, refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  // With nothing saved, the system's setting is followed as it changes.
  watchSystemTheme(refresh);

  const cookies = window.cookieStore;
  cookies?.addEventListener('change', (event) => {
    if (
      [...event.changed, ...event.deleted].some(
        (cookie) =>
          cookie.name === THEME_COOKIE || cookie.name === LEGACY_THEME_COOKIE,
      )
    ) {
      refresh();
    }
  });
};

/** The store's subscribe for an app's Theme: one per `createTheme`. */
export const themeSubscriber =
  (cookieDomain: string | undefined) =>
  (listener: () => void): (() => void) => {
    beginListening(cookieDomain);
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

export const useThemeValue = (
  subscribe: (listener: () => void) => () => void,
): Theme =>
  useSyncExternalStore(
    subscribe,
    () => (listening ? current : readBrowserTheme()),
    () => SERVER_THEME,
  );

export const setThemeValue = (theme: Theme, cookieDomain?: string): void => {
  writeThemeCookie(theme, cookieDomain);
  publish(theme, true);
  window.dispatchEvent(new Event(THEME_CHANGED));
};
