import type { Browser, BrowserType } from 'playwright-core';

import { SnapshotRenderError } from './errors.js';

/**
 * Starts a headless Chromium through the optional peer \`playwright-core\`, or
 * explains what to install.
 */
export async function openBrowser(
  executablePath: string | undefined,
): Promise<Browser> {
  const { chromium } = await loadPlaywright();
  return launch(chromium, executablePath);
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
