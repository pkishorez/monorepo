import { readFileSync } from 'node:fs';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import type { ThemeRegistration } from 'shiki/core';
import { describe, expect, it } from 'vitest';

/*
 * The one theme stands for both of GitHub's: they hold the same rules in
 * the same order, and `shiki.css` gives each rule's variable its light and
 * its dark colour, as the themes have them.
 */

/** What each variable stands for in a GitHub theme, as CSS declarations. */
const declarationsOf = (source: ThemeRegistration) =>
  (source.tokenColors ?? [])
    .flatMap(({ settings }, at) => [
      ...(settings.foreground
        ? [`--shiki-${at}: ${settings.foreground};`]
        : []),
      ...(settings.background
        ? [`--shiki-${at}-bg: ${settings.background};`]
        : []),
    ])
    .map((line) => `  ${line}`);

const cssOf = () =>
  [
    '.shiki {',
    ...declarationsOf(githubLight),
    '}',
    '',
    ".dark .shiki,\n[data-theme='dark'] .shiki {",
    ...declarationsOf(githubDark),
    '}',
  ].join('\n');

describe('the one GitHub theme', () => {
  it('stands for both: the light and dark themes hold the same rules in order', () => {
    expect(githubDark.tokenColors?.map(({ scope }) => scope)).toEqual(
      githubLight.tokenColors?.map(({ scope }) => scope),
    );
  });

  it('has each rule’s light and dark colour in shiki.css', () => {
    const css = readFileSync(
      new URL('../../theme/css/shiki.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain(cssOf());
  });
});
