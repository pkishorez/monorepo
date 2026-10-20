export type Theme = 'light' | 'dark';

/** The cookie a saved Theme is kept in, on the Shared Cookie Domain. */
export const THEME_COOKIE = 'kui-theme';
/** The name the Auth Worker's pages kept it under before: read once, then moved. */
export const LEGACY_THEME_COOKIE = 'theme';
export const THEME_CHANGED = 'kui-theme-change';
/**
 * Each Theme's `--background` as hex, for what takes no CSS variable: the
 * `theme-color` meta, the manifest, and the root's colour before the
 * stylesheet arrives. Keep them equal to `css/theme.css`.
 */
export const THEME_COLORS: Record<Theme, string> = {
  light: '#f8f9fa',
  dark: '#0b0c0e',
};

export const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark';
