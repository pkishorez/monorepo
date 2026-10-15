import { Start } from '@kestack/kabuki/start';
import { Devtools, Theme } from './components/index.ts';

/**
 * The HTML around the app. The Theme's script runs before the body is
 * painted, and changes `<html>` before React hydrates it, which React is
 * told to expect. Kabuki's devtools sit around the app, from the button in
 * the corner.
 */
export default function Document({ children }: Start.DocumentProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Start.Head />
        <Theme.Script />
      </head>
      <body>
        <Devtools>{children}</Devtools>
        <Start.Scripts />
      </body>
    </html>
  );
}
