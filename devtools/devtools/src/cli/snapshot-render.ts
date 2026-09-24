import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Data, Effect } from 'effect';
import type { Browser, BrowserType } from 'playwright-core';

// Two levels below the package root from both `src/cli/` and `dist/server/`.
const DEFAULT_UI_ROOT = fileURLToPath(new URL('../ui/', import.meta.url));
// A name no network answers; the page and its assets come from disk.
const ORIGIN = 'http://devtools.snapshot';

const contentTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

export class SnapshotRenderError extends Data.TaggedError(
  'SnapshotRenderError',
)<{
  readonly reason:
    | 'playwright-missing'
    | 'no-browser'
    | 'ui-missing'
    | 'page-error'
    | 'timeout';
  readonly message: string;
}> {}

export interface RenderSnapshotOptions {
  /** The JSON Snapshot Request the page decodes. */
  readonly payload: unknown;
  readonly theme: 'light' | 'dark';
  readonly maxWidth: number;
  readonly maxHeight: number;
  /** Device pixels per CSS pixel in the PNG. */
  readonly scale: number;
  /** Folder holding the built page; defaults to the package's `dist/ui`. */
  readonly uiRoot?: string | undefined;
  /** A Chromium executable to run instead of what Playwright finds. */
  readonly browser?: string | undefined;
  readonly timeoutMs: number;
}

export interface RenderedSnapshot {
  readonly png: Uint8Array;
  /** CSS pixels; the PNG is `scale` times larger on each side. */
  readonly width: number;
  readonly height: number;
}

/**
 * Opens the bundled Snapshot page from disk in headless Chromium, hands it the
 * Snapshot Request, waits for the drawing to settle, and captures it as PNG.
 * No server listens: the page and its assets are served to the browser
 * straight from `uiRoot` through a request route.
 */
export function renderSnapshot(
  options: RenderSnapshotOptions,
): Effect.Effect<RenderedSnapshot, SnapshotRenderError> {
  return Effect.tryPromise({
    try: () => render(options),
    catch: (cause) =>
      cause instanceof SnapshotRenderError
        ? cause
        : new SnapshotRenderError({
            reason: /Timeout/i.test(String(cause)) ? 'timeout' : 'page-error',
            message: String(cause instanceof Error ? cause.message : cause),
          }),
  });
}

async function render(options: RenderSnapshotOptions) {
  const uiRoot = options.uiRoot ?? DEFAULT_UI_ROOT;
  await assertSnapshotPage(uiRoot);
  const { chromium } = await loadPlaywright();
  const browser = await launch(chromium, options.browser);
  try {
    const context = await browser.newContext({
      viewport: {
        width: options.maxWidth + 64,
        height: options.maxHeight + 160,
      },
      deviceScaleFactor: options.scale,
      colorScheme: options.theme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route(`${ORIGIN}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const file = join(
        uiRoot,
        normalize(pathname).replace(/^(\.\.[/\\])+/, ''),
      );
      try {
        const body = await readFile(file);
        await route.fulfill({
          body,
          contentType:
            contentTypes[extname(file)] ?? 'application/octet-stream',
        });
      } catch {
        await route.fulfill({ status: 404, body: `Not found: ${pathname}` });
      }
    });
    // Scripts are strings: this file compiles without DOM types.
    await page.addInitScript(
      `window.__DEVTOOLS_SNAPSHOT__ = ${JSON.stringify(options.payload)};`,
    );
    await page.goto(`${ORIGIN}/snapshot.html`, { waitUntil: 'load' });

    const settled = page.locator(
      '[data-devtools-snapshot="ready"], [data-devtools-snapshot="error"]',
    );
    try {
      await settled.waitFor({ state: 'attached', timeout: options.timeoutMs });
    } catch {
      throw new SnapshotRenderError({
        reason: 'timeout',
        message:
          `The Snapshot page did not settle within ${options.timeoutMs}ms.` +
          (pageErrors.length > 0
            ? ` Page errors: ${pageErrors.join('; ')}`
            : ''),
      });
    }
    if ((await settled.getAttribute('data-devtools-snapshot')) === 'error') {
      throw new SnapshotRenderError({
        reason: 'page-error',
        message: (await settled.textContent()) ?? 'The Snapshot page failed.',
      });
    }
    await page.evaluate('document.fonts.ready.then(() => undefined)');
    const box = await settled.boundingBox();
    if (box === null) {
      throw new SnapshotRenderError({
        reason: 'page-error',
        message: 'The Snapshot element has no size.',
      });
    }
    const width = Math.ceil(box.width);
    const height = Math.ceil(box.height);
    await page.setViewportSize({ width, height });
    await page.evaluate(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))',
    );
    const png = await settled.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
    });
    return { png, width, height };
  } finally {
    await browser.close();
  }
}

async function assertSnapshotPage(uiRoot: string) {
  const page = join(uiRoot, 'snapshot.html');
  try {
    const info = await stat(page);
    if (info.isFile()) return;
  } catch {
    // reported below
  }
  throw new SnapshotRenderError({
    reason: 'ui-missing',
    message: `The bundled Snapshot page is missing at ${page}. Build the package, or pass --ui-root.`,
  });
}

async function loadPlaywright(): Promise<typeof import('playwright-core')> {
  try {
    return await import('playwright-core');
  } catch {
    throw new SnapshotRenderError({
      reason: 'playwright-missing',
      message:
        'playwright-core is not installed. Add it next to @pkishorez/devtools: `pnpm add -D playwright-core`.',
    });
  }
}

// Playwright's own Chromium when it is installed, else a system Chrome or
// Chromium, so a CI runner that ships Chrome needs no download step.
async function launch(
  chromium: BrowserType,
  executablePath: string | undefined,
): Promise<Browser> {
  const attempts: ReadonlyArray<Parameters<BrowserType['launch']>[0]> =
    executablePath === undefined
      ? [
          {},
          { channel: 'chrome' },
          { channel: 'chromium' },
          { channel: 'msedge' },
        ]
      : [{ executablePath }];
  const failures: string[] = [];
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, ...attempt });
    } catch (cause) {
      failures.push(
        String(cause instanceof Error ? cause.message : cause).split('\n')[0] ??
          '',
      );
    }
  }
  throw new SnapshotRenderError({
    reason: 'no-browser',
    message:
      executablePath === undefined
        ? `No Chromium could be started. Install one with \`npx playwright-core install chromium\`, or point --browser (DEVTOOLS_BROWSER) at a Chrome or Chromium executable. Tried: ${failures.join(' | ')}`
        : `Could not start the browser at ${executablePath}: ${failures.join(' | ')}`,
  });
}
