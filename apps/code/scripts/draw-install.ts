import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { splashScreens } from '@kestack/web-platform/pwa/splash';

/*
 * Draws what installing Code shows, into `public/`:
 *
 * 1. Splash       `splash/<w>x<h>.png`, one per iOS screen `splashScreens`
 *                 lists.
 * 2. Screenshots  `screenshots/narrow.png` and `screenshots/wide.png`, the
 *                 manifest's, for the install sheet on a phone and the
 *                 install dialog on a desktop.
 *
 * All are one screen, centred both ways: the Code mark, what Code is, then
 * "powered by", the ke logo and "stack". The Splash holds them in the block
 * signing in centres (`Screen` in `src/app/sign-in/sign-in.tsx`), so the mark
 * and the credit stay where they are as the app opens.
 *
 * Each is a page Chromium renders at the screen's size in points and its
 * scale, in the dark Theme the manifest's background colour is, so the
 * launch reads as one surface. Run `pnpm draw:install` after changing the
 * mark or a screen; the PNGs are committed.
 */

const app = join(import.meta.dirname, '..');
const pub = join(app, 'public');

// The dark Theme's tokens (web-platform `ui/theme/css/theme.css`).
const COLORS = {
  background: 'oklch(0.145 0 0)',
  foreground: 'oklch(0.985 0 0)',
  mutedForeground: 'oklch(0.708 0 0)',
};

// Inter, as the app sets its text, from the Web Platform's own copy.
const inter = readFileSync(
  join(
    realpathSync(join(app, 'node_modules/@kestack/web-platform')),
    'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  ),
).toString('base64');

// The ke logo, black on white, flipped for the dark Theme as the About page does.
const ke = readFileSync(join(pub, 'ke-stack.svg')).toString('base64');

// The favicon's prompt, `>_`, drawn on a 20-unit square.
const PROMPT = 'M6 7l3 3-3 3M10.5 13.5H14';

/** The mark; `size` is its edge in points. */
const mark = (size: number) => `
  <svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true">
    <rect width="20" height="20" rx="5" fill="${COLORS.foreground}"/>
    <path d="${PROMPT}" stroke="${COLORS.background}" stroke-width="1.6"
      stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;

const page = (body: string) => `<!doctype html>
<html><head><style>
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${inter}) format('woff2'); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    background: ${COLORS.background};
    color: ${COLORS.foreground};
    font-family: Inter, sans-serif;
    -webkit-font-smoothing: antialiased;
    position: relative;
    overflow: hidden;
  }
  .stage { height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .description { line-height: 1.4; text-wrap: balance; }
  .muted { color: ${COLORS.mutedForeground}; }
  .credit { font-weight: 400; }
  .credit > span { display: inline-flex; align-items: center; gap: 0.6em; }
  .credit b { display: inline-flex; align-items: center; gap: 0.4em; font-weight: 500; color: ${COLORS.foreground}; }
  .credit img { height: 1.5em; width: 1.5em; border-radius: 0.35em; filter: invert(1); }
</style></head><body>${body}</body></html>`;

const CREDIT = `<span>powered by <b><img src="data:image/svg+xml;base64,${ke}" alt="">stack</b></span>`;

const DESCRIPTION = 'connect with your coding agents from any device.';

/**
 * The one screen, `large` for a tablet or a desktop; sizes are in points.
 * `block` is how tall the centred block is, the credit at its foot; none
 * lets it be as tall as what it holds.
 */
const screen = (large: boolean, block?: number) =>
  page(`
    <div class="stage" style="padding:0 ${large ? 96 : 32}px">
      <div style="display:flex;flex-direction:column;align-items:center;${block === undefined ? '' : `height:${block}px`}">
        ${mark(large ? 72 : 56)}
        <p class="muted description" style="margin-top:${large ? 28 : 24}px;font-size:${large ? 24 : 18}px;max-width:${large ? 520 : 296}px">
          ${DESCRIPTION}
        </p>
        <p class="muted credit" style="margin-top:${block === undefined ? `${large ? 28 : 24}px` : 'auto'};font-size:${large ? 15 : 13}px">
          ${CREDIT}
        </p>
      </div>
    </div>`);

const browser = await chromium.launch();
const draw = async (
  html: string,
  size: { width: number; height: number; scale: number },
  path: string,
) => {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
  });
  const tab = await context.newPage();
  await tab.setContent(html);
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path });
  await context.close();
};

try {
  mkdirSync(join(pub, 'splash'), { recursive: true });
  for (const each of splashScreens) {
    const width = each.width / each.scale;
    const height = each.height / each.scale;
    await draw(
      screen(each.tablet, each.tablet ? 266 : 264),
      { width, height, scale: each.scale },
      join(pub, each.href),
    );
  }
  mkdirSync(join(pub, 'screenshots'), { recursive: true });
  await draw(
    screen(false),
    { width: 360, height: 640, scale: 3 },
    join(pub, 'screenshots/narrow.png'),
  );
  await draw(
    screen(true),
    { width: 960, height: 540, scale: 2 },
    join(pub, 'screenshots/wide.png'),
  );
} finally {
  await browser.close();
}
