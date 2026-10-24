import type { ComponentType, ReactNode } from 'react';
import { Start } from '@kestack/kabuki/start';
import { Pwa, PwaHead } from '../../pwa/prompts/index.ts';
import { DEVICE_SCRIPT } from '../../ui/input/device/index.ts';
import { FontPreload, type createTheme } from '../../ui/theme/index.ts';

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
 * 5. PWA     the manifest and the Build ID in the head, and around the
 *            app the worker, the Update Prompt and the Install Prompt;
 *            nothing in a build `app({ pwa: false })` made.
 *
 * Start's own parts sit where Start wants them: `<Start.Head />` first in
 * the head, `<Start.Scripts />` last in the body.
 */

export interface DocumentOptions {
  /** The app's Theme, from `createTheme`. */
  readonly theme: ReturnType<typeof createTheme>;
  /** More for the head, after the Web Platform's, such as the favicon. */
  readonly head?: ReactNode;
  /** Default: `en`. */
  readonly lang?: string;
  /** What sits around every page, inside the PWA, such as devtools. */
  readonly around?: (app: ReactNode) => ReactNode;
}

/**
 * The HTML around a Kabuki Start app, for `Start.app({ document })`:
 * `document({ theme: Theme })`.
 */
export const document = ({
  theme,
  head,
  lang = 'en',
  around = (app) => app,
}: DocumentOptions): ComponentType<Start.DocumentProps> =>
  function Document({ children }) {
    return (
      <html lang={lang} suppressHydrationWarning>
        <head>
          <Start.Head viewport={VIEWPORT} />
          <FontPreload />
          <theme.Script />
          <script dangerouslySetInnerHTML={{ __html: DEVICE_SCRIPT }} />
          <PwaHead />
          {head}
        </head>
        <body>
          <Pwa>{around(children)}</Pwa>
          <Start.Scripts />
        </body>
      </html>
    );
  };
