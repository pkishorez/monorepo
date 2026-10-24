import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { splashScreens } from '@kestack/web-platform/pwa/splash';

/*
 * Draws what installing Code shows, into `public/`:
 *
 * 1. Splash       `splash/<w>x<h>.png`, one per iOS screen `splashScreens`
 *                 lists: the Code mark and name a third of the way down,
 *                 "Powered by kestack" above the home bar.
 * 2. Screenshots  `screenshots/narrow.png` and `screenshots/wide.png`, the
 *                 manifest's, for Android's richer install sheet.
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
  card: 'oklch(0.195 0 0)',
  mutedForeground: 'oklch(0.708 0 0)',
};

// Inter, as the app sets its text, from the Web Platform's own copy.
const inter = readFileSync(
  join(
    realpathSync(join(app, 'node_modules/@kestack/web-platform')),
    'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  ),
).toString('base64');

// The favicon's prompt, `>_`, drawn on a 20-unit square.
const PROMPT = 'M6 7l3 3-3 3M10.5 13.5H14';

/** The mark and the name side by side; `size` is the mark's edge in points. */
const lockup = (size: number) => `
  <div class="lockup" style="gap:${size * 0.3}px">
    <svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true">
      <rect width="20" height="20" rx="5" fill="${COLORS.card}"/>
      <path d="${PROMPT}" stroke="${COLORS.foreground}" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
    <span style="font-size:${size * 0.6}px">Code</span>
  </div>`;

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
  .lockup { display: flex; align-items: center; }
  .lockup span { font-weight: 600; letter-spacing: -0.02em; line-height: 1; }
  .muted { color: ${COLORS.mutedForeground}; }
  .credit { font-weight: 400; letter-spacing: 0.005em; }
  .credit b { font-weight: 500; color: ${COLORS.foreground}; }
</style></head><body>${body}</body></html>`;

const CREDIT = 'Powered by <b>kestack</b>';

/**
 * The Splash for one screen, in points. The home bar takes 34 points on
 * iPhones without a Home button and 20 on iPads without one; the
 * credit sits a step above it.
 */
const splash = (width: number, height: number, tablet: boolean) => {
  const portraitHeight = Math.max(width, height);
  const homeBar = tablet
    ? portraitHeight >= 1133
      ? 20
      : 0
    : portraitHeight >= 812
      ? 34
      : 0;
  const mark = tablet ? 72 : 56;
  return page(`
    <div style="position:absolute;left:0;right:0;top:${height / 3}px;transform:translateY(-50%);display:flex;justify-content:center">
      ${lockup(mark)}
    </div>
    <p class="muted credit" style="position:absolute;left:0;right:0;bottom:${homeBar + (tablet ? 32 : 24)}px;text-align:center;font-size:${tablet ? 15 : 13}px">
      ${CREDIT}
    </p>`);
};

const DESCRIPTION = 'Claude Code and Codex sessions in your project folders.';

/** A manifest screenshot: the lockup over what Code is, in the Splash's look. */
const screenshot = (wide: boolean) =>
  page(`
    <div style="height:100%;display:flex;flex-direction:column;justify-content:center;${wide ? 'padding:0 96px' : 'padding:0 32px;align-items:center;text-align:center'}">
      ${lockup(wide ? 72 : 56)}
      <p class="muted" style="margin-top:${wide ? 28 : 24}px;font-size:${wide ? 24 : 18}px;line-height:1.4;max-width:${wide ? 520 : 280}px;text-wrap:balance">
        ${DESCRIPTION}
      </p>
    </div>
    <p class="muted credit" style="position:absolute;bottom:${wide ? 40 : 32}px;${wide ? 'left:96px' : 'left:0;right:0;text-align:center'};font-size:${wide ? 15 : 13}px">
      ${CREDIT}
    </p>`);

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
      splash(width, height, each.tablet),
      { width, height, scale: each.scale },
      join(pub, each.href),
    );
  }
  mkdirSync(join(pub, 'screenshots'), { recursive: true });
  await draw(
    screenshot(false),
    { width: 360, height: 640, scale: 3 },
    join(pub, 'screenshots/narrow.png'),
  );
  await draw(
    screenshot(true),
    { width: 960, height: 540, scale: 2 },
    join(pub, 'screenshots/wide.png'),
  );
} finally {
  await browser.close();
}
