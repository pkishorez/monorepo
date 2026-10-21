import { createTheme } from '@kestack/web-platform/theme';

/* Light or dark, kept in a cookie for this host alone: the app is local. */
export const Theme = createTheme({ cookieDomain: undefined });
