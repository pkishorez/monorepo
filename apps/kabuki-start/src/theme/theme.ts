import { createTheme } from '@kestack/web-platform/theme';

/*
 * Light or dark, the Web Platform's Theme: kept in the `kui-theme` cookie
 * and put on `<html>` (the `dark` class and `data-theme`) before the first
 * paint by its `Script` in the Document's head. A static page is cached for
 * everyone, so the theme is read from the cookie in the browser, never drawn
 * by the server. With nothing kept, dark.
 */
export const Theme = createTheme();
