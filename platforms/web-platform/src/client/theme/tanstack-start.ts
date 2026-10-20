import { getRequestHeader } from '@tanstack/react-start/server';
import { themeFromCookies } from '../../theme/index.ts';

/** The saved Theme in the request's cookies; undefined before one is saved. */
export const getTheme = () => themeFromCookies(getRequestHeader('cookie'));
