// Usage: pnpm record <walkthrough>
// Plays a Walkthrough's storyboard in the docs app, beat by beat on the
// voiceover's timing, with a visible cursor doing each beat's take, and
// records the whole run in one take: public/recordings/<walkthrough>.mp4,
// with <walkthrough>.json beside it holding its length and the moments the
// cursor clicked. The docs dev server must be running; DOCS_URL is its
// address. Run `pnpm voiceover <walkthrough>` first: the voice sets the pace.
// FROM=<beat> starts the take at that beat, to try a chapter's takes.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  type CDPSession,
  type Locator,
  type Page,
} from 'playwright-core';
import type { Stage } from '../src/foundation/walkthrough/stage.ts';
import {
  timingOf,
  type Beat,
  type Take,
} from '../src/foundation/walkthrough/timing.ts';

const docs = process.env.DOCS_URL;
const name = process.argv[2];
if (!name || !docs)
  throw new Error(
    'Usage: DOCS_URL=http://127.0.0.1:<port> pnpm record <walkthrough>',
  );

const viewport = { width: 1280, height: 720 };
const scale = 1.5;
const output = { width: 1920, height: 1080, fps: 60 };

type Point = { x: number; y: number };

const folder = resolve('src/walkthroughs', name);
const { beats } = (await import(join(folder, 'script.ts'))) as {
  beats: ReadonlyArray<Beat>;
};
const { takes, page: path } = (await import(join(folder, 'takes.ts'))) as {
  takes: Record<string, Take<Stage>>;
  page: string;
};
const manifest = join(folder, 'voiceover', 'voiceover.json');
if (!existsSync(manifest))
  throw new Error(`No voiceover yet: run pnpm voiceover ${name}`);
const lines = JSON.parse(readFileSync(manifest, 'utf8')) as {
  id: string;
  seconds: number;
}[];
const all = timingOf(beats, lines, takes);
const from = process.env.FROM;
const skipped = from ? all.beats.findIndex((beat) => beat.id === from) : 0;
if (skipped < 0) throw new Error(`No beat "${from}"`);
const offset = all.beats[skipped]!.start;
const timing = {
  beats: all.beats.slice(skipped).map((beat) => ({
    ...beat,
    start: beat.start - offset,
    end: beat.end - offset,
  })),
  seconds: all.seconds - offset,
};

async function record() {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  const url = new URL(path, docs);
  await context.addCookies([
    { name: 'kui-theme', value: 'dark', domain: url.hostname, path: '/' },
  ]);
  context.setDefaultTimeout(10_000);
  await context.addInitScript(cursorScript);
  const page = await context.newPage();
  await page.goto(url.href);
  await page.waitForFunction(() => window.showreel !== undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);

  const clicked: number[] = [];
  const cdp = await context.newCDPSession(page);
  const scratch = mkdtempSync(join(tmpdir(), `record-${name}-`));
  const capture = await startCapture(cdp, scratch);
  const begun = Date.now() / 1000;
  const until = async (seconds: number) => {
    const left = begun + seconds - Date.now() / 1000;
    if (left > 0) await page.waitForTimeout(left * 1000);
  };

  const stage = stageOf(page, clicked);
  for (const beat of timing.beats) {
    await until(beat.start);
    const late = Date.now() / 1000 - begun - beat.start;
    if (late > 0.25) console.warn(`${beat.id} starts ${late.toFixed(2)}s late`);
    await page.evaluate((id) => window.showreel!.go(id), beat.id);
    const play = takes[beat.id]?.play;
    if (play)
      await play({
        ...stage,
        at: (seconds) => until(beat.start + seconds),
      }).catch(async (error: unknown) => {
        await page.screenshot({
          path: resolve('generated', `${name}-failed.png`),
        });
        throw error;
      });
    console.log(
      `${beat.id} done at ${(Date.now() / 1000 - begun).toFixed(1)}s`,
    );
  }
  await until(timing.seconds);
  const { frames, stoppedAt } = await capture.stop();
  await context.close();

  // The video starts when the take began, on the last frame drawn by then.
  const first = Math.max(
    0,
    frames.filter((frame) => frame.at <= begun).length - 1,
  );
  const kept = frames
    .slice(first)
    .map((frame, i) => (i === 0 ? { ...frame, at: begun } : frame));
  const out = resolve('public/recordings');
  mkdirSync(out, { recursive: true });
  encode(scratch, kept, stoppedAt, join(out, `${name}.mp4`));
  rmSync(scratch, { recursive: true, force: true });
  const round = (value: number) => Math.round(value * 1000) / 1000;
  writeFileSync(
    join(out, `${name}.json`),
    `${JSON.stringify(
      {
        seconds: round(stoppedAt - begun),
        clicks: clicked.map((at) => round(at - begun)),
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `${name}: ${(stoppedAt - begun).toFixed(1)}s, ${clicked.length} clicks, ${(kept.length / (stoppedAt - begun)).toFixed(0)} fps captured`,
  );
}

function stageOf(page: Page, clicked: number[]): Omit<Stage, 'at'> {
  let cursor: Point = { x: viewport.width * 0.78, y: viewport.height * 0.6 };
  const button = (name: string | RegExp, within?: string) =>
    (within ? page.getByLabel(within, { exact: true }) : page)
      .getByRole('button', { name, exact: typeof name === 'string' })
      .first();
  const glideTo = async (target: Locator) => {
    const to = await centerOf(target);
    await glide(page, cursor, to);
    cursor = to;
  };
  // Presses where the cursor is, if `target` is still under it. A target
  // that moved, like a Timeline row pushed down by a new Message, is glided
  // to again, up to three times, before the take fails.
  const press = async (target: Locator) => {
    for (let attempt = 0; ; attempt++) {
      await page.waitForTimeout(90);
      const box = await target.boundingBox({ timeout: 300 }).catch(() => null);
      const inside =
        box !== null &&
        cursor.x >= box.x &&
        cursor.x <= box.x + box.width &&
        cursor.y >= box.y &&
        cursor.y <= box.y + box.height;
      if (inside) break;
      if (attempt === 2)
        throw new Error(`${String(target)} moved before its click`);
      await glideTo(target);
    }
    clicked.push(Date.now() / 1000);
    await page.mouse.down();
    await page.waitForTimeout(90);
    await page.mouse.up();
  };
  return {
    click: async (name, within) => {
      const target = button(name, within);
      await glideTo(target);
      await press(target);
    },
    clicks: async (name, times, within, gap = 0.15) => {
      const target = button(name, within);
      await glideTo(target);
      for (let i = 0; i < times; i++) {
        if (i > 0) await page.waitForTimeout(gap * 1000);
        await press(target);
      }
    },
    tab: async (name) => {
      const target = page.getByRole('tab', { name, exact: true });
      await glideTo(target);
      await press(target);
    },
    press: async (key, label) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      await page.evaluate((shown) => window.__recorderKey?.(shown), label);
      await page.keyboard.press(key);
    },
  };
}

async function centerOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox();
  if (box === null) throw new Error(`${String(target)} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
    showreel?: { go: (id: string) => void };
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

const browser = await chromium.launch({ headless: true });
try {
  await record();
} finally {
  await browser.close();
}
