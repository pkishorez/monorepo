import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';

import {
  requestScript,
  type SnapshotRequest,
} from '../../domain/snapshot/index.js';
import type { Browser, Page } from 'playwright-core';

import { openBrowser } from './browser.js';
import { SnapshotRenderError } from './errors.js';

// The bundled page beside the built server, `dist/ui/`; running from source
// passes --ui-root.
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

interface RenderSnapshotOptions {
  /** Device pixels per CSS pixel in the PNG. */
  readonly scale: number;
  /** Folder holding the built page; defaults to the package's `dist/ui`. */
  readonly uiRoot?: string | undefined;
  /** A Chromium executable to run instead of what Playwright finds. */
  readonly browser?: string | undefined;
  readonly timeoutMs: number;
}

interface RenderedSnapshot {
  readonly png: Uint8Array;
  /** CSS pixels; the PNG is `scale` times larger on each side. */
  readonly width: number;
  readonly height: number;
}

export function openSnapshotRenderer(options: RenderSnapshotOptions) {
  const uiRoot = options.uiRoot ?? DEFAULT_UI_ROOT;
  return Effect.acquireRelease(
    attempt(async () => {
      await assertSnapshotPage(uiRoot);
      return openBrowser(options.browser);
    }),
    (browser) => Effect.promise(() => browser.close()),
  ).pipe(
    Effect.map(
      (browser) =>
        (
          request: SnapshotRequest,
        ): Effect.Effect<RenderedSnapshot, SnapshotRenderError> =>
          attempt(() => render(browser, uiRoot, request, options)),
    ),
  );
}

function attempt<A>(
  run: () => Promise<A>,
): Effect.Effect<A, SnapshotRenderError> {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof SnapshotRenderError
        ? cause
        : new SnapshotRenderError({
            reason: /Timeout/i.test(String(cause)) ? 'timeout' : 'page-error',
            message: String(cause instanceof Error ? cause.message : cause),
          }),
  });
}

async function render(
  browser: Browser,
  uiRoot: string,
  request: SnapshotRequest,
  options: RenderSnapshotOptions,
): Promise<RenderedSnapshot> {
  const context = await browser.newContext({
    viewport: {
      width: request.maxWidth + 64,
      height: request.maxHeight + 160,
    },
    deviceScaleFactor: options.scale,
    colorScheme: request.theme,
    reducedMotion: 'reduce',
  });
  try {
    return await capture(await context.newPage(), uiRoot, request, options);
  } finally {
    await context.close();
  }
}

async function capture(
  page: Page,
  uiRoot: string,
  request: SnapshotRequest,
  options: RenderSnapshotOptions,
): Promise<RenderedSnapshot> {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  await page.route(`${ORIGIN}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const file = join(uiRoot, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      await route.fulfill({
        body,
        contentType: contentTypes[extname(file)] ?? 'application/octet-stream',
      });
    } catch {
      pageErrors.push(`Missing file: ${file}`);
      await route.fulfill({ status: 404, body: `Not found: ${pathname}` });
    }
  });
  // Scripts are strings: this file compiles without DOM types.
  await page.addInitScript(requestScript(request));
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
        (pageErrors.length > 0 ? ` Page errors: ${pageErrors.join('; ')}` : ''),
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
