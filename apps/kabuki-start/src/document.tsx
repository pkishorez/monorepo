import { Start } from '@kestack/kabuki/start';
import { Theme } from './theme/index.ts';

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
        <Theme.Script />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}
