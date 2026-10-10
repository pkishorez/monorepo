// Usage: pnpm record [look] [clip]
// Records the Rockets demo for the Effect Oak Walkthrough: every clip, or one,
// in every Look, or one. Each clip opens the demo fresh (a new Log), drives it
// with a visible cursor and writes public/recordings/<look>/<clip>.mp4 with
// <clip>.json beside it: its length and the moments the cursor clicked, in
// seconds from the clip's start. The docs dev server must be running
// (`pnpm --filter docs dev`); ROCKETS_URL points somewhere else.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  type CDPSession,
  type Locator,
  type Page,
} from 'playwright-core';

const rockets =
  process.env.ROCKETS_URL ?? 'http://127.0.0.1:4173/demos/effect-oak/rockets';
const looks = ['plain', 'colorful', 'exotic'] as const;
type Look = (typeof looks)[number];

const viewport = { width: 1600, height: 900 };
const scale = 2;
const output = { width: 2560, height: 1440, fps: 60 };

type Point = { x: number; y: number };

// What a clip can do to the demo. Every click glides the cursor to its
// target first; `rocket` scopes a button to one rocket's card.
type Stage = {
  click: (name: string, rocket?: string) => Promise<void>;
  clicks: (name: string, times: number, rocket?: string) => Promise<void>;
  quietly: (name: string, times: number, rocket?: string) => Promise<void>;
  tab: (name: 'Timeline' | 'Inspector') => Promise<void>;
  press: (key: string, label: string) => Promise<void>;
  rest: (seconds: number) => Promise<void>;
  // Rests until `seconds` into the clip, to keep pace with the narration.
  until: (seconds: number) => Promise<void>;
  pan: (by: Point) => Promise<void>;
  park: (name: string, rocket?: string, by?: Point) => Promise<void>;
  widen: (by: number) => Promise<void>;
  page: Page;
};

type Clip = {
  chapter: number;
  // Runs before capture starts, so the clip opens on a settled frame.
  setup?: (stage: Stage) => Promise<void>;
  story: (stage: Stage) => Promise<void>;
};

const clips: Record<string, Clip> = {
  'c1-actor': {
    chapter: 1,
    setup: async (s) => {
      await s.tab('Inspector');
      await s.park('Fuel', undefined, { x: 150, y: 90 });
    },
    story: async (s) => {
      await s.rest(0.5);
      await s.clicks('Fuel', 4);
      await s.click('Drain');
      await s.rest(1.6);
    },
  },
  'c2-states': {
    chapter: 2,
    setup: async (s) => {
      await s.tab('Inspector');
      await s.park('Fuel', undefined, { x: 150, y: 90 });
    },
    story: async (s) => {
      await s.until(0.4);
      await s.clicks('Fuel', 8);
      await s.until(5.4);
      await s.click('Launch');
      await s.until(8.2);
      await s.click('Land');
      await s.until(9.5);
      await s.click('Reset');
      await s.until(10.8);
    },
  },
  'c2-lost': {
    chapter: 2,
    setup: async (s) => {
      await s.tab('Inspector');
      await s.park('Fuel', undefined, { x: 110, y: 70 });
    },
    story: async (s) => {
      await s.rest(0.3);
      await s.click('Fuel');
      await s.click('Launch');
      await s.rest(1.5);
    },
  },
  'c3-many': {
    chapter: 3,
    setup: async (s) => {
      await s.tab('Inspector');
      await s.park('Build', undefined, { x: -160, y: 120 });
    },
    story: async (s) => {
      await s.until(0.3);
      await s.clicks('Build', 3);
      await s.until(2.6);
      await s.clicks('Fuel', 8, 'R-2');
      await s.until(6.3);
      await s.click('Launch', 'R-2');
      await s.until(9.2);
      await s.click('Land', 'R-2');
      await s.until(11.2);
    },
  },
  'c4-capabilities': {
    chapter: 4,
    setup: async (s) => {
      await s.quietly('Fuel', 5, 'R-1');
      await s.tab('Inspector');
      await s.park('Storm', undefined, { x: -220, y: 140 });
    },
    story: async (s) => {
      await s.until(2.6);
      await s.click('Storm');
      await s.click('Launch', 'R-1');
      await s.until(5.0);
      await s.click('Storm');
      await s.click('Launch', 'R-1');
      await s.until(8.4);
    },
  },
  'c5-motion': {
    chapter: 5,
    setup: async (s) => {
      await s.quietly('Build', 1);
      await s.quietly('Fuel', 10, 'R-1');
      await s.quietly('Fuel', 10, 'R-2');
      await s.park('Launch', 'R-1', { x: 120, y: 90 });
    },
    story: async (s) => {
      await s.rest(0.4);
      await s.click('Launch', 'R-1');
      await s.rest(0.5);
      await s.click('Launch', 'R-2');
      await s.rest(0.9);
      await s.click('Land', 'R-1');
      await s.rest(0.4);
      await s.click('Land', 'R-2');
      await s.rest(1.4);
    },
  },
  'c6-timetravel': {
    chapter: 6,
    setup: async (s) => {
      await s.park('Fuel', 'R-1', { x: 160, y: 110 });
    },
    story: async (s) => {
      await s.until(1.6);
      await s.click('Fuel', 'R-1');
      await s.until(3.2);
      await s.click('Launch', 'R-1');
      for (const at of [7.6, 8.5, 9.4]) {
        await s.until(at);
        await s.press('ArrowDown', '↓');
      }
      await s.until(11.0);
      await s.click('Fork here');
      await s.until(12.3);
      await s.clicks('Fuel', 5, 'R-1');
      await s.click('Launch', 'R-1');
      await s.until(16.2);
      await s.click('Land', 'R-1');
      await s.until(18.6);
    },
  },
  'd1-commands': {
    chapter: 7,
    setup: async (s) => {
      await s.quietly('Fuel', 2, 'R-1');
      await s.tab('Inspector');
      await s.park('Launch', 'R-1', { x: 140, y: 100 });
    },
    story: async (s) => {
      await s.rest(0.4);
      await s.click('Launch', 'R-1');
      await s.rest(1.2);
      await s.click('Launch', 'R-1');
      await s.rest(1.1);
      await s.click('Abort', 'R-1');
      await s.rest(1.3);
    },
  },
  'd2-inspector': {
    chapter: 7,
    setup: async (s) => {
      await s.widen(200);
      await s.quietly('Build', 2);
      await s.quietly('Fuel', 1, 'R-1');
      await s.quietly('Launch', 1, 'R-1');
      await s.quietly('Fuel', 8, 'R-2');
      await s.quietly('Launch', 1, 'R-2');
      await s.quietly('Fuel', 2, 'R-3');
      await s.page.waitForTimeout(3600);
      await s.quietly('Land', 1, 'R-2');
      await s.tab('Inspector');
      await s.quietly('Rocket, 3 running', 1);
      await s.page.waitForTimeout(800);
      await s.pan({ x: 0, y: -90 });
      await s.park('Launch', 'R-3', { x: 140, y: 120 });
    },
    story: async (s) => {
      await s.until(0.4);
      await s.click('Launch', 'R-3');
      for (const at of [2.6, 3.7, 4.8, 5.9]) {
        await s.until(at);
        await s.press('ArrowDown', '↓');
      }
      await s.until(8.0);
    },
  },
};

async function record(look: Look, id: string, clip: Clip) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  context.setDefaultTimeout(10_000);
  await context.addInitScript(cursorScript);
  const page = await context.newPage();
  await page.goto(`${rockets}?chapter=${clip.chapter}&look=${look}&chrome=0`);
  await page.getByRole('tablist', { name: 'View' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);

  const clicked: number[] = [];
  const stage = stageOf(page, clicked);
  await clip.setup?.(stage);
  await page.waitForTimeout(700);

  const cdp = await context.newCDPSession(page);
  const scratch = mkdtempSync(join(tmpdir(), `record-${id}-`));
  const capture = await startCapture(cdp, scratch);
  stage.start();
  await clip.story(stage);
  const { frames, stoppedAt } = await capture.stop();
  await context.close();

  const start = frames[0]!.at;
  const seconds = stoppedAt - start;
  const folder = resolve('public/recordings', look);
  mkdirSync(folder, { recursive: true });
  encode(scratch, frames, stoppedAt, join(folder, `${id}.mp4`));
  rmSync(scratch, { recursive: true, force: true });
  const round = (value: number) => Math.round(value * 1000) / 1000;
  writeFileSync(
    join(folder, `${id}.json`),
    `${JSON.stringify(
      {
        seconds: round(seconds),
        clicks: clicked.map((at) => round(at - start)),
      },
      null,
      2,
    )}\n`,
  );
  const rate = frames.length / seconds;
  console.log(
    `${look}/${id}: ${seconds.toFixed(1)}s, ${clicked.length} clicks, ${rate.toFixed(0)} fps captured`,
  );
}

function stageOf(page: Page, clicked: number[]): Stage & { start: () => void } {
  let started = Date.now() / 1000;
  let cursor: Point = { x: viewport.width / 2, y: viewport.height / 2 };
  const button = (name: string, rocket?: string) =>
    (rocket ? page.getByRole('region', { name: rocket }) : page)
      .getByRole('button', { name, exact: true })
      .first();
  const glideTo = async (target: Locator) => {
    const to = await centerOf(target);
    await glide(page, cursor, to);
    cursor = to;
  };
  // Presses where the cursor is, but only if `target` is still there: a
  // button that changed under the cursor fails the clip instead of
  // recording a wrong click.
  const press = async (target: Locator) => {
    await page.waitForTimeout(110);
    const box = await target.boundingBox({ timeout: 300 }).catch(() => null);
    const inside =
      box !== null &&
      cursor.x >= box.x &&
      cursor.x <= box.x + box.width &&
      cursor.y >= box.y &&
      cursor.y <= box.y + box.height;
    if (!inside) throw new Error(`${String(target)} moved before its click`);
    clicked.push(Date.now() / 1000);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
  };
  const stage: Stage & { start: () => void } = {
    page,
    click: async (name, rocket) => {
      const target = button(name, rocket);
      await glideTo(target);
      await press(target);
      await page.waitForTimeout(380);
    },
    clicks: async (name, times, rocket) => {
      const target = button(name, rocket);
      await glideTo(target);
      for (let i = 0; i < times; i++) {
        await press(target);
        await page.waitForTimeout(i === times - 1 ? 380 : 100);
      }
    },
    quietly: async (name, times, rocket) => {
      for (let i = 0; i < times; i++) await button(name, rocket).click();
    },
    tab: async (name) => {
      await page.getByRole('tab', { name, exact: true }).click();
    },
    press: async (key, label) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      await page.evaluate((shown) => window.__recorderKey?.(shown), label);
      await page.keyboard.press(key);
    },
    rest: (seconds) => page.waitForTimeout(seconds * 1000),
    until: async (seconds) => {
      const left = started + seconds - Date.now() / 1000;
      if (left > 0) await page.waitForTimeout(left * 1000);
    },
    start: () => {
      started = Date.now() / 1000;
    },
    park: async (name, rocket, by = { x: 0, y: 0 }) => {
      const at = await centerOf(button(name, rocket));
      cursor = {
        x: Math.min(viewport.width - 40, Math.max(40, at.x + by.x)),
        y: Math.min(viewport.height - 40, Math.max(40, at.y + by.y)),
      };
      await page.mouse.move(cursor.x, cursor.y);
    },
    // Drags the Inspector's map by `by` pixels from an empty spot near its
    // top right.
    pan: async (by) => {
      const map = await page
        .getByRole('button', { name: 'Fit to view' })
        .boundingBox();
      if (map === null) throw new Error('The Inspector map is not showing');
      const from = { x: map.x - 40, y: map.y - 260 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 12 });
      await page.mouse.up();
    },
    // Drags the devtools wider by `by` pixels and gives its map more room.
    widen: async (by) => {
      await drag(
        page,
        page.getByRole('separator', { name: 'Resize Devtools' }),
        {
          x: -by,
          y: 0,
        },
      );
      await stage.tab('Inspector');
      await drag(page, page.locator('[data-slot="resizable-handle"]'), {
        x: 0,
        y: 60,
      });
    },
  };
  return stage;
}

async function centerOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox();
  if (box === null) throw new Error(`${String(target)} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, handle: Locator, by: Point) {
  const from = await centerOf(handle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 12 });
  await page.mouse.up();
}

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// Moves the mouse along a gentle arc, eased, one step per 60fps frame on a
// fixed schedule so a slow step never stretches the motion.
async function glide(page: Page, from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  const bend = Math.min(50, distance * 0.1);
  const control = {
    x: (from.x + to.x) / 2 - (dy / distance) * bend,
    y: (from.y + to.y) / 2 + (dx / distance) * bend,
  };
  const duration = Math.min(800, Math.max(420, 340 + distance * 0.45));
  const frame = 1000 / 60;
  const begun = performance.now();
  for (let index = 1; ; index++) {
    const progress = Math.min(1, (index * frame) / duration);
    const t = easeInOutCubic(progress);
    const u = 1 - t;
    await page.mouse.move(
      u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    );
    if (progress >= 1) return;
    const wait = begun + (index + 1) * frame - performance.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  }
}

type Frame = { at: number; file: string };

// Chromium's screencast sends a frame whenever the page repaints, stamped
// with when it was drawn; the frames are written as they come.
async function startCapture(cdp: CDPSession, folder: string) {
  const frames: Frame[] = [];
  const writes: Promise<void>[] = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const file = join(folder, `${frames.length}.jpg`);
    frames.push({ at: metadata.timestamp ?? Date.now() / 1000, file });
    writes.push(writeFile(file, Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: viewport.width * scale,
    maxHeight: viewport.height * scale,
    everyNthFrame: 1,
  });
  return {
    stop: async () => {
      const stoppedAt = Date.now() / 1000;
      await cdp.send('Page.stopScreencast');
      await Promise.all(writes);
      return {
        frames: frames.filter((frame) => frame.at <= stoppedAt),
        stoppedAt,
      };
    },
  };
}

// Lays the frames out at the times they were drawn, then resamples them to a
// steady frame rate and encodes H.264 that every player and Remotion reads.
function encode(folder: string, frames: Frame[], end: number, out: string) {
  const list = frames
    .map((frame, i) => {
      const next = frames[i + 1]?.at ?? end;
      return `file '${frame.file}'\nduration ${Math.max(0.001, next - frame.at).toFixed(6)}`;
    })
    .join('\n');
  const listFile = join(folder, 'frames.txt');
  writeFileSync(listFile, `${list}\nfile '${frames.at(-1)!.file}'\n`);
  const run = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-vf',
      `fps=${output.fps},scale=${output.width}:${output.height}:flags=lanczos,format=yuv420p`,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '16',
      '-movflags',
      '+faststart',
      out,
    ],
    { encoding: 'utf8' },
  );
  if (run.status !== 0) throw new Error(run.stderr);
}

declare global {
  interface Window {
    __recorderKey?: (label: string) => void;
  }
}

const arrowSvg =
  '<svg width="34" height="34" viewBox="0 0 28 28"><path d="M8.2 4.9v16.2l4.1-3.8 2.6 6.1 3-1.3-2.6-6h5.6z" fill="#fff"/><path d="M9.2 7.3v11.5l3-2.9.4-.4 2.8 6.4 1.2-.5-2.7-6.3h4.3z" fill="#000"/></svg>';

// The arrow's tip sits at (8.2, 4.9) of its 28-unit box, drawn at 34px.
const cursorStyles = `<style>
:host { all: initial; }
.arrow { position: fixed; left: -9.96px; top: -5.95px; width: 34px; height: 34px; transform: translate(-200px, -200px); filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.35)); }
.arrow svg { display: block; transform-origin: 9.96px 5.95px; transition: transform 110ms ease-out; }
.arrow.down svg { transform: scale(0.88); }
.ring { position: fixed; width: 46px; height: 46px; border-radius: 50%; background: rgba(130,140,160,0.2); border: 2px solid rgba(255,255,255,0.9); box-shadow: 0 0 0 1.5px rgba(0,0,0,0.28), 0 2px 10px rgba(0,0,0,0.2); }
.badge { position: fixed; left: calc(100% - 220px); bottom: 36px; min-width: 34px; padding: 6px 12px; border-radius: 10px; background: rgba(20,22,28,0.92); border: 1px solid rgba(255,255,255,0.18); color: #fff; font: 600 22px/1.1 ui-sans-serif, system-ui, -apple-system, sans-serif; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.35); opacity: 0; transform: translate(-50%, 0); }
</style>`;

// Drawn into every page: a macOS-style arrow that follows the real mouse, a
// soft ring on each press, and a badge for pressed keys. It never takes
// pointer events, and sits in the top layer above the devtools.
const cursorScript = `(() => {
  if (window.top !== window.self) return;
  let host = null, root = null, arrow = null, badge = null;
  const raise = () => {
    try { if (host.matches(':popover-open')) host.hidePopover(); host.showPopover(); } catch {}
  };
  const mount = () => {
    if (root) return root;
    if (!document.body) return null;
    host = document.createElement('recorder-cursor');
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('popover', 'manual');
    host.style.cssText = 'all:initial;position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = ${JSON.stringify(cursorStyles)};
    document.body.appendChild(host);
    raise();
    return root;
  };
  const add = (name, html) => {
    const parent = mount();
    if (!parent) return null;
    const element = document.createElement('div');
    element.className = name;
    if (html) element.innerHTML = html;
    parent.appendChild(element);
    return element;
  };
  const listen = (type, handler) => addEventListener(type, handler, { capture: true, passive: true });
  listen('mousemove', (event) => {
    if (!arrow) arrow = add('arrow', ${JSON.stringify(arrowSvg)});
    if (arrow) arrow.style.transform = 'translate(' + event.clientX + 'px,' + event.clientY + 'px)';
  });
  listen('mousedown', (event) => {
    raise();
    arrow?.classList.add('down');
    const ring = add('ring');
    if (!ring) return;
    ring.style.left = event.clientX + 'px';
    ring.style.top = event.clientY + 'px';
    ring.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.35)', opacity: 0.9 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    ).onfinish = () => ring.remove();
  });
  listen('mouseup', () => arrow?.classList.remove('down'));
  window.__recorderKey = (label) => {
    if (!badge) badge = add('badge');
    if (!badge) return;
    raise();
    badge.textContent = label;
    badge.getAnimations().forEach((animation) => animation.cancel());
    badge.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 6px) scale(0.96)' },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.15 },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, 0) scale(1)' },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' },
    );
  };
})();`;

const [lookArg, clipArg] = process.argv.slice(2);
const pickedLooks = lookArg ? [lookArg as Look] : looks;
const pickedClips = clipArg ? [clipArg] : Object.keys(clips);
for (const look of pickedLooks)
  if (!looks.includes(look)) throw new Error(`No Look "${look}"`);
for (const id of pickedClips)
  if (!clips[id]) throw new Error(`No clip "${id}"`);

const browser = await chromium.launch({ headless: true });
try {
  for (const look of pickedLooks)
    for (const id of pickedClips) await record(look, id, clips[id]!);
} finally {
  await browser.close();
}
