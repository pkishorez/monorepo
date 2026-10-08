import { join } from 'node:path';

import type { Browser, BrowserContext, Page } from 'playwright-core';

import type {
  BrowserHost,
  DeviceHost,
  StepRequest,
  TabHost,
} from '../../../story/index.js';
import type {
  DeviceKind,
  Frame,
  PhaseName,
  Recording,
  Step,
} from '../../../story/schema/index.js';
import type { ProofClock } from '../proof-clock.js';
import { sleep } from './motion.js';
import { overlayScript } from './overlay.js';
import { startRecording, type Recorder } from './recording.js';
import { makeTabDriver } from './tab.js';

export interface BrowserSession {
  readonly host: BrowserHost;
  /** Stops every Recording and closes every Device; safe to call while Steps are still running. */
  readonly close: () => Promise<{
    readonly steps: readonly Step[];
    readonly recordings: readonly Recording[];
  }>;
}

export interface SessionOptions {
  readonly browser: Browser;
  readonly devices: Readonly<Record<DeviceKind, DeviceDescriptor>>;
  readonly url: string;
  readonly folder: string;
  readonly clock: ProofClock;
  readonly phase: () => PhaseName;
}

export interface DeviceDescriptor {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
  readonly userAgent?: string;
}

interface OpenTab {
  readonly name: string;
  readonly slug: string;
  readonly device: string;
  readonly kind: DeviceKind;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly openedAt: number;
  readonly page: Page;
  readonly recorder: Recorder;
  /** Set once the Tab closes, so its Recording ends there. */
  ended?: { readonly frames: readonly Frame[]; readonly closedAt: number };
}

/** One Proof's Devices and Tabs, each Tab recorded and every Step logged on the Proof clock. */
export function openBrowserSession(options: SessionOptions): BrowserSession {
  const { browser, devices, url, folder, clock, phase } = options;
  const contexts: BrowserContext[] = [];
  const tabs: OpenTab[] = [];
  const steps: Step[] = [];
  let screenshots = 0;

  const screenshot = async (page: Page): Promise<string | null> => {
    if (page.isClosed()) return null;
    screenshots += 1;
    const file = `steps/${screenshots}.jpg`;
    await page.screenshot({
      path: join(folder, file),
      type: 'jpeg',
      quality: 80,
      scale: 'css',
    });
    return file;
  };

  const record = async <A>(
    page: Page,
    tab: string,
    request:
      | Pick<StepRequest, 'kind' | 'name'>
      | { kind: 'open'; name: string },
    perform: () => Promise<A>,
  ): Promise<A> => {
    const step = {
      name: request.name,
      kind: request.kind,
      tab,
      phase: phase(),
      startedAt: clock.now(),
    };
    try {
      const result = await perform();
      const endedAt = clock.now();
      steps.push({
        ...step,
        endedAt,
        passed: true,
        screenshot: await screenshot(page),
      });
      return result;
    } catch (error) {
      const endedAt = clock.now();
      steps.push({
        ...step,
        endedAt,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        screenshot: await screenshot(page).catch(() => null),
      });
      throw error;
    }
  };

  const openTab = async (
    context: BrowserContext,
    device: DeviceHost,
    deviceName: string,
    name: string,
  ): Promise<TabHost> => {
    if (tabs.some((tab) => tab.name === name)) {
      throw new Error(`A Tab named "${name}" is already open`);
    }
    const kind = device.kind;
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const viewport = devices[kind].viewport;
    const scale = Math.min(2, devices[kind].deviceScaleFactor);
    const slug = slugify(
      name,
      tabs.length + 1,
      new Set(['steps', ...tabs.map((tab) => tab.slug)]),
    );
    const recorder = await startRecording(cdp, {
      folder,
      slug,
      clock,
      size: { width: viewport.width * scale, height: viewport.height * scale },
    });
    tabs.push({
      name,
      slug,
      device: deviceName,
      kind,
      viewport,
      openedAt: clock.now(),
      page,
      recorder,
    });
    const driver = makeTabDriver(page, cdp, kind);
    const open = tabs.at(-1)!;
    const closeTab = async () => {
      const frames = await recorder.stop();
      await page.close();
      open.ended = { frames, closedAt: clock.now() };
    };
    await record(
      page,
      name,
      { kind: 'open', name: `Open ${name}` },
      async () => {
        await page.goto(url);
        await driver.rest();
        await sleep(700);
      },
    );
    return {
      name,
      device,
      step: (request) =>
        record(page, name, request, () =>
          request.kind === 'close' ? closeTab() : driver.perform(request),
        ),
      text: (target) => page.locator(target).innerText(),
      count: (target) => page.locator(target).count(),
      evaluate: (fn) => page.evaluate(fn),
    };
  };

  const openDevice = async (kind: DeviceKind): Promise<DeviceHost> => {
    const context = await browser.newContext({
      ...devices[kind],
      reducedMotion: 'no-preference',
    });
    context.setDefaultTimeout(10_000);
    await context.addInitScript(overlayScript(kind));
    contexts.push(context);
    const name = `Device ${contexts.length}`;
    const device: DeviceHost = {
      name,
      kind,
      open: (tab) => openTab(context, device, name, tab),
    };
    return device;
  };

  return {
    host: {
      open: async (kind, tab) => (await openDevice(kind)).open(tab),
    },
    close: async () => {
      const recordings = await Promise.all(
        tabs.map(async (tab): Promise<Recording> => {
          const { frames, closedAt } = tab.ended ?? {
            frames: await tab.recorder.stop(),
            closedAt: clock.now(),
          };
          return {
            tab: tab.name,
            device: tab.device,
            deviceKind: tab.kind,
            viewport: tab.viewport,
            openedAt: tab.openedAt,
            closedAt,
            frames,
          };
        }),
      );
      await Promise.all(contexts.map((context) => context.close()));
      return {
        steps: [...steps].sort(
          (left, right) => left.startedAt - right.startedAt,
        ),
        recordings,
      };
    },
  };
}

/** Tab names are unique but their slugs may not be; the Tab's position keeps folders apart. */
function slugify(
  name: string,
  position: number,
  taken: ReadonlySet<string>,
): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tab';
  return taken.has(slug) ? `${slug}-${position}` : slug;
}
