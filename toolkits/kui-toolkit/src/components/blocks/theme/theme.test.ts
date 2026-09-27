// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { themeFromCookies } from './cookie.ts';
import { applyThemeToDocument } from './document.ts';
import { createTheme } from './theme.ts';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  document.head.innerHTML = '';
});

describe('theme cookies', () => {
  it('defaults missing and invalid values to dark', () => {
    expect(themeFromCookies(undefined)).toBe('dark');
    expect(themeFromCookies('kui-theme=system')).toBe('dark');
  });

  it('finds a valid theme among other cookies', () => {
    expect(themeFromCookies('session=abc; kui-theme=light; flag=1')).toBe(
      'light',
    );
  });
});

describe('theme document integration', () => {
  it('updates the class, color scheme and live status-bar color together', () => {
    applyThemeToDocument('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.backgroundColor).toBe(
      'rgb(10, 10, 10)',
    );
    const dark = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute('content');

    applyThemeToDocument('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).not.toBe(dark);
  });

  it('updates every theme-color tag left by app integrations', () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#111"><meta name="theme-color" content="#222">';
    applyThemeToDocument('light');
    expect(
      [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
        meta.getAttribute('content'),
      ),
    ).toEqual(['#ffffff', '#ffffff']);
  });

  it('keeps manifest colors inside the KUI theme controller', () => {
    const theme = createTheme();
    expect(theme.manifest('dark')).toEqual({
      theme_color: '#0a0a0a',
      background_color: '#0a0a0a',
    });
  });
});
