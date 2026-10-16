import { Start } from '@kestack/kabuki/start';
import { Theme } from './components/index.ts';

/**
 * The HTML around the app. The Theme's script runs before the body is
 * painted, and changes `<html>` before React hydrates it, which React is
 * told to expect.
 */
export default function Document({ children }: Start.DocumentProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Start.Head />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link
          rel="icon"
          type="image/png"
          sizes="96x96"
          href="/favicon-96x96.png"
        />
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
