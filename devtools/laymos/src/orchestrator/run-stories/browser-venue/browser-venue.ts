import { Effect, Scope } from 'effect';

import type { DeviceKind } from '../../../story/schema/index.js';
import type { ProofFile } from '../load-stories.js';
import { startPageHost } from './page-host.js';
import {
  openBrowserSession,
  type BrowserSession,
  type DeviceDescriptor,
  type SessionOptions,
} from './session.js';

export type { BrowserSession } from './session.js';

/** What every browser Proof in one run shares: one Chromium and one page host. */
export interface BrowserVenue {
  readonly session: (
    id: string,
    options: Pick<SessionOptions, 'folder' | 'clock' | 'phase'>,
  ) => BrowserSession;
}

export function openBrowserVenue(
  projectRoot: string,
  files: readonly ProofFile[],
): Effect.Effect<BrowserVenue, string, Scope.Scope> {
  return Effect.gen(function* () {
    const playwright = yield* Effect.tryPromise({
      try: () => import('playwright-core'),
      catch: () =>
        'Browser Proofs need playwright-core: add it to the Project’s devDependencies.',
    });
    const browser = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => playwright.chromium.launch({ headless: true }),
        catch: (cause) => `Could not launch Chromium: ${message(cause)}`,
      }),
      (browser) => Effect.promise(() => browser.close()),
    );
    const pageHost = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () => startPageHost(projectRoot, files),
        catch: (cause) =>
          `Could not start the Proof page host: ${message(cause)}`,
      }),
      (host) => Effect.promise(() => host.close()),
    );
    const pixel = playwright.devices['Pixel 7']!;
    const devices: Record<DeviceKind, DeviceDescriptor> = {
      desktop: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
      mobile: {
        viewport: pixel.viewport,
        deviceScaleFactor: pixel.deviceScaleFactor,
        isMobile: pixel.isMobile,
        hasTouch: pixel.hasTouch,
        userAgent: pixel.userAgent,
      },
    };
    return {
      session: (id, options) =>
        openBrowserSession({
          ...options,
          browser,
          devices,
          url: pageHost.url(id),
        }),
    };
  });
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
