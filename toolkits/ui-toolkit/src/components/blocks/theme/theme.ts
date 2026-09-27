import { createElement, Fragment } from 'react';
import { bootstrapSource } from './document.ts';
import { THEME_COLORS, type Theme } from './model.ts';
import { setThemeValue, useThemeValue } from './store.ts';

export function createTheme(
  options: { readonly cookieDomain?: string | undefined } = {},
) {
  const setTheme = (theme: Theme) => setThemeValue(theme, options.cookieDomain);

  function useTheme() {
    const theme = useThemeValue();
    return {
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    };
  }

  function Script(props: { readonly initialTheme?: Theme }) {
    const initialTheme = props.initialTheme ?? 'dark';
    return createElement(
      Fragment,
      null,
      createElement('meta', {
        name: 'theme-color',
        content: THEME_COLORS[initialTheme],
      }),
      createElement('script', {
        dangerouslySetInnerHTML: { __html: bootstrapSource(initialTheme) },
      }),
    );
  }

  return {
    useTheme,
    Script,
    manifest: (theme: Theme) => ({
      theme_color: THEME_COLORS[theme],
      background_color: THEME_COLORS[theme],
    }),
  };
}
