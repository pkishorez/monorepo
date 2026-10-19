import { Start } from '@kestack/kabuki/start';
import { createTheme } from '@kestack/web-platform/theme';

/*
 * The HTML around Console. The Theme's script runs in the head, before the
 * body is painted, and puts light or dark on `<html>` from the `kui-theme`
 * cookie, which on kishore.app the docs and the other apps share; React is
 * told to expect the change. Dark when nothing is kept.
 */

const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

const Theme = createTheme({ cookieDomain });

export default function Document({ children }: Start.DocumentProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Start.Head />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Theme.Script />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}
