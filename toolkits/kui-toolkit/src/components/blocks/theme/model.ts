export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'kui-theme';
export const DEFAULT_THEME: Theme = 'dark';
export const THEME_CHANGED = 'kui-theme-change';
export const THEME_COLORS: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0a0a0a',
};

export const isTheme = (value: unknown): value is Theme =>
  value === 'light' || value === 'dark';
