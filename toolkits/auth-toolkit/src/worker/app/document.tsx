import { Start } from '@kestack/kabuki/start';
import { createTheme, FontPreload } from '@kestack/web-theme';

// A page brought back from the back-forward cache shows what it was when it
// left for Google; drawing it fresh asks the Auth Worker again.
const FRESH_ON_BACK = `addEventListener('pageshow',function(e){if(e.persisted)location.reload()})`;

// Only its head Script is used here; the toggle saves on the Shared Cookie Domain.
const theme = createTheme();

/**
 * The HTML around the pages, as the Web Platform's Document draws every
 * kstack app's: Inter preloaded, and the Theme (the saved one, else the
 * system's) set on the root before the first paint.
 */
export default function Document({ children }: Start.DocumentProps) {
  return (
    // The Theme script sets `data-theme` here before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <Start.Head />
        <FontPreload />
        <theme.Script />
        <script dangerouslySetInnerHTML={{ __html: FRESH_ON_BACK }} />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}
