import { Start } from '@kestack/kabuki/start';
import type { DocumentProps } from '@kestack/kabuki/start/app';

// A page brought back from the back-forward cache shows what it was when it
// left for Google; drawing it fresh asks the Auth Worker again.
const FRESH_ON_BACK = `addEventListener('pageshow',function(e){if(e.persisted)location.reload()})`;

// The Theme before the first paint: the saved one, else the system's.
const THEME = `var t=/(?:^|;\\s*)theme=(light|dark)(?:;|$)/.exec(document.cookie);document.documentElement.dataset.theme=t?t[1]:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'`;

/** The HTML around the pages: light or dark, as the saved Theme or the system says. */
export default function Document({ children }: DocumentProps) {
  return (
    // The Theme script sets `data-theme` here before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <Start.Head />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <script dangerouslySetInnerHTML={{ __html: FRESH_ON_BACK }} />
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}
