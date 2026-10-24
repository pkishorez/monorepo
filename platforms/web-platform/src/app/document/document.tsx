import type { ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { DEVICE_SCRIPT } from '../input/device/index.ts';
import { FontPreload, type createTheme } from '../theme/index.ts';

// Drawn under the notch and home bar, which the App Shell pads for; the
// on-screen keyboard shrinks the page rather than covering it.
const VIEWPORT =
  'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content';

/*
 * The Document for an app on Kabuki Start, with the Web Platform's look
 * ready before the first paint:
 *
 * 1. Font    Inter preloaded, with a fallback sized to match it, so text
 *            never moves when Inter arrives; see `theme/font.tsx`.
 * 2. Theme   the Theme's script, which sets light or dark on `<html>`
 *            before the body paints, and which React is told to expect.
 * 3. Device  the script that marks `<html>` with `data-keyboard` and
 *            `data-touch`, for the `keyboard:` and `touch:` variants.
 * 4. Screen  the viewport drawn under the notch and home bar, which the
 *            App Shell pads for.
 *
 * Start's own parts sit where Start wants them: `<Start.Head />` first in
 * the head, `<Start.Scripts />` last in the body.
 */

export interface DocumentProps {
  /** The app's Theme, from `createTheme`. */
  readonly theme: ReturnType<typeof createTheme>;
  /** More for the head, after the Web Platform's: icons, or `<PwaHead />`. */
  readonly head?: ReactNode;
  /** Default: `en`. */
  readonly lang?: string;
  /** The app, as Start draws it; wrap it in what sits around every page. */
  readonly children: ReactNode;
}

/** The HTML around a Kabuki Start app: write `src/document.tsx` as one of these. */
export function Document({
  theme,
  head,
  lang = 'en',
  children,
}: DocumentProps) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <Start.Head viewport={VIEWPORT} />
        <FontPreload />
        <theme.Script />
        <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} />
        {head}
      </head>
      <body>
        {children}
        <Start.Scripts />
      </body>
    </html>
  );
}
