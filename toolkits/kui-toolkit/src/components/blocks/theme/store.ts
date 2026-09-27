import { useSyncExternalStore } from 'react';
import { themeFromCookies, writeThemeCookie } from './cookie.ts';
import { applyThemeToDocument } from './document.ts';
import {
  DEFAULT_THEME,
  THEME_CHANGED,
  THEME_COOKIE,
  type Theme,
} from './model.ts';

let current: Theme = DEFAULT_THEME;
let listening = false;
const listeners = new Set<() => void>();

const readBrowserTheme = (): Theme => themeFromCookies(document.cookie);

const publish = (theme: Theme, freeze = false): void => {
  current = theme;
  applyThemeToDocument(theme, freeze);
  for (const listener of listeners) listener();
};

const refresh = (): void => {
  const theme = readBrowserTheme();
  if (theme !== current) publish(theme);
};

const beginListening = (): void => {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  current = readBrowserTheme();
  applyThemeToDocument(current);
  window.addEventListener(THEME_CHANGED, refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);

  const cookies = window.cookieStore;
  cookies?.addEventListener('change', (event) => {
    if (
      [...event.changed, ...event.deleted].some(
        (cookie) => cookie.name === THEME_COOKIE,
      )
    ) {
      refresh();
    }
  });
};

const subscribe = (listener: () => void): (() => void) => {
  beginListening();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useThemeValue = (): Theme =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_THEME,
  );

export const setThemeValue = (theme: Theme, cookieDomain?: string): void => {
  writeThemeCookie(theme, cookieDomain);
  const apply = () => {
    publish(theme, true);
    window.dispatchEvent(new Event(THEME_CHANGED));
  };
  // iOS 26 re-samples the status bar from the page only on a view transition,
  // as route changes do; a plain style change leaves the old color behind.
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(apply);
  } else {
    apply();
  }
};
