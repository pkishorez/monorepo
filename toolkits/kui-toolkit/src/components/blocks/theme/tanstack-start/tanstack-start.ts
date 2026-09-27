import { getCookie } from '@tanstack/react-start/server';
import { themeFromCookies } from '../cookie.ts';
import { THEME_COOKIE } from '../model.ts';

export const getTheme = () =>
  themeFromCookies(`${THEME_COOKIE}=${getCookie(THEME_COOKIE) ?? ''}`);
