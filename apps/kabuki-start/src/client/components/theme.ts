import { createTheme } from '@kestack/web-platform/ui/theme';

/*
 * Light or dark, the Web Platform's Theme: kept in the `kui-theme` cookie
 * and put on `<html>` (the `dark` class and `data-theme`) before the first
 * paint by its `Script` in the Document's head. A static page is cached for
 * everyone, so the theme is read from the cookie in the browser, never drawn
 * by the server. With nothing kept, dark. On kishore.app the cookie is the
 * whole domain's, shared with the docs and the console: one kept for this
 * site alone would sit beside it under the same name, and a pick would be
 * read back from the other one.
 */
const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

export const Theme = createTheme({ cookieDomain });
