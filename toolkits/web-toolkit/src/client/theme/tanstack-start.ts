import { getCookie } from '@tanstack/react-start/server';
import { THEME_COOKIE, themeFromCookies } from '../../theme/index.ts';

export const getTheme = () =>
  themeFromCookies(`${THEME_COOKIE}=${getCookie(THEME_COOKIE) ?? ''}`);
