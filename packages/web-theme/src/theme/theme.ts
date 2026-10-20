import { createElement, Fragment } from 'react';
import { THEME_SCRIPT } from './document.ts';
import { THEME_COLORS, type Theme } from './model.ts';
import { StatusBar } from './status-bar.ts';
import { setThemeValue, themeSubscriber, useThemeValue } from './store.ts';

/**
 * An app's Theme: light or dark, saved in the `kui-theme` cookie on
 * `cookieDomain` when this host is under it, and the system's setting
 * until a choice is saved.
 */
export function createTheme(
  options: { readonly cookieDomain?: string | undefined } = {},
) {
  const setTheme = (theme: Theme) => setThemeValue(theme, options.cookieDomain);
  const subscribe = themeSubscriber(options.cookieDomain);

  function useTheme() {
    const theme = useThemeValue(subscribe);
    return {
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    };
  }

  /**
   * For the head: the `theme-color` of each system setting, then the
   * script that switches the root before the first paint.
   */
  function Script() {
    return createElement(
      Fragment,
      null,
      createElement('meta', {
        name: 'theme-color',
        media: '(prefers-color-scheme: light)',
        content: THEME_COLORS.light,
      }),
      createElement('meta', {
        name: 'theme-color',
        media: '(prefers-color-scheme: dark)',
        content: THEME_COLORS.dark,
      }),
      createElement('script', {
        dangerouslySetInnerHTML: { __html: THEME_SCRIPT },
      }),
    );
  }

  return {
    useTheme,
    Script,
    StatusBar,
    manifest: (theme: Theme) => ({
      theme_color: THEME_COLORS[theme],
      background_color: THEME_COLORS[theme],
    }),
  };
}
