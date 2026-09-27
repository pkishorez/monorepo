import type { Environment } from './environment';

// Most specific first; every one of them means the app was launched installed.
const INSTALLED_DISPLAY_MODES = [
  'fullscreen',
  'window-controls-overlay',
  'standalone',
  'minimal-ui',
] as const;

// Same breakpoint as kui's sidebar (hooks/use-mobile), so "wide" here is
// exactly where the sidebar stops being a sheet.
const WIDE_QUERY = '(min-width: 768px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Every media query the Environment depends on; a change to any re-reads it. */
export const WATCHED_QUERIES = [
  ...INSTALLED_DISPLAY_MODES.map((mode) => `(display-mode: ${mode})`),
  WIDE_QUERY,
  REDUCED_MOTION_QUERY,
];

const matches = (win: Window, query: string) =>
  typeof win.matchMedia === 'function' && win.matchMedia(query).matches;

export const readPlatform = (win: Window): Environment['platform'] => {
  const { userAgent, maxTouchPoints } = win.navigator;
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
  // iPadOS reports a Mac user agent; no Mac has a multi-touch screen.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'desktop';
};

/** `navigator.standalone` covers home-screen apps on iOS before 16.4, which match no display-mode query. */
export const readDisplay = (win: Window): Environment['display'] => {
  const installed =
    INSTALLED_DISPLAY_MODES.some((mode) =>
      matches(win, `(display-mode: ${mode})`),
    ) ||
    (win.navigator as { readonly standalone?: boolean }).standalone === true;
  return installed ? 'installed' : 'tab';
};

export const readViewport = (win: Window): Environment['viewport'] =>
  matches(win, WIDE_QUERY) ? 'wide' : 'compact';

export const readReducedMotion = (win: Window): boolean =>
  matches(win, REDUCED_MOTION_QUERY);
