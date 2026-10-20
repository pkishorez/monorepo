// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themeFromCookies } from './cookie.ts';
import { applyThemeToDocument, THEME_SCRIPT } from './document.ts';
import { createTheme } from './theme.ts';
import { setThemeValue, themeSubscriber } from './store.ts';

const prefersDark = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    addEventListener: () => {},
  }));

const clearCookies = () => {
  for (const name of ['kui-theme', 'theme']) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.head.innerHTML = '';
  clearCookies();
});

afterEach(() => vi.unstubAllGlobals());

describe('theme cookies', () => {
  it('says nothing is saved for missing and unknown values', () => {
    expect(themeFromCookies(undefined)).toBeUndefined();
    expect(themeFromCookies('kui-theme=system')).toBeUndefined();
  });

  it('finds a saved theme among other cookies', () => {
    expect(themeFromCookies('session=abc; kui-theme=light; flag=1')).toBe(
      'light',
    );
  });

  it('reads the legacy name when the current one is absent', () => {
    expect(themeFromCookies('theme=dark')).toBe('dark');
    expect(themeFromCookies('theme=dark; kui-theme=light')).toBe('light');
  });
});

describe('the head script', () => {
  const run = () => new Function(THEME_SCRIPT)();

  it('follows the system with nothing saved', () => {
    prefersDark(true);
    run();
    expect(document.documentElement.dataset.theme).toBe('dark');
    prefersDark(false);
    run();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('prefers the saved choice, under either name', () => {
    prefersDark(true);
    document.cookie = 'theme=light; Path=/';
    run();
    expect(document.documentElement.dataset.theme).toBe('light');
    document.cookie = 'kui-theme=dark; Path=/';
    run();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('theme document integration', () => {
  it('switches data-theme, the color scheme and the chrome color together', () => {
    applyThemeToDocument('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.backgroundColor).toBe(
      'rgb(11, 12, 14)',
    );
    expect(document.body.style.backgroundColor).toBe('rgb(11, 12, 14)');
    const dark = document
      .querySelector('meta[name="theme-color"]')
      ?.getAttribute('content');

    applyThemeToDocument('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).not.toBe(dark);
    expect(document.body.style.backgroundColor).toBe('rgb(248, 249, 250)');
  });

  it('updates every theme-color tag left by app integrations', () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#111"><meta name="theme-color" content="#222">';
    applyThemeToDocument('light');
    expect(
      [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
        meta.getAttribute('content'),
      ),
    ).toEqual(['#f8f9fa', '#f8f9fa']);
  });

  it('saves the choice and updates the chrome during an in-place switch', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    applyThemeToDocument('dark');
    setThemeValue('light');
    expect(document.cookie).toContain('kui-theme=light');
    expect(document.documentElement.style.backgroundColor).toBe(
      'rgb(248, 249, 250)',
    );
    expect(document.body.style.backgroundColor).toBe('rgb(248, 249, 250)');
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#f8f9fa');
  });

  it('moves a legacy choice to the current cookie once', () => {
    prefersDark(false);
    document.cookie = 'theme=dark; Path=/';
    const unsubscribe = themeSubscriber(undefined)(() => {});
    expect(document.cookie).toContain('kui-theme=dark');
    expect(document.cookie).not.toMatch(/(^|; )theme=/);
    expect(document.documentElement.dataset.theme).toBe('dark');
    unsubscribe();
  });

  it('keeps manifest colors inside the theme controller', () => {
    const theme = createTheme();
    expect(theme.manifest('dark')).toEqual({
      theme_color: '#0b0c0e',
      background_color: '#0b0c0e',
    });
  });
});
