import githubLight from '@shikijs/themes/github-light';
import type { ThemeRegistration } from 'shiki/core';

/*
 * One theme for light and dark: GitHub's, each of its rules' colours a CSS
 * variable, so a source is highlighted once, and the page's theme picks
 * what the variables stand for (`shiki.css`). GitHub's light and dark
 * themes hold the same rules in the same order; only their colours differ.
 */

export const THEME = 'github';

/** A rule's colour as a variable: its foreground, or its background. */
const variable = (at: number, part: 'foreground' | 'background') =>
  `var(--shiki-${at}${part === 'background' ? '-bg' : ''})`;

export const theme: ThemeRegistration = {
  ...githubLight,
  name: THEME,
  // Plain text in the page's own colour, on its own ground, as before
  // it is highlighted.
  fg: 'inherit',
  bg: 'transparent',
  colors: {
    ...githubLight.colors,
    'editor.foreground': 'inherit',
    'editor.background': 'transparent',
  },
  tokenColors: (githubLight.tokenColors ?? []).map((rule, at) => ({
    ...rule,
    settings: {
      ...rule.settings,
      ...(rule.settings.foreground && {
        foreground: variable(at, 'foreground'),
      }),
      ...(rule.settings.background && {
        background: variable(at, 'background'),
      }),
    },
  })),
};
