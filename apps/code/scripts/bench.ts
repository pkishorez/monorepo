import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { chromium, type CDPSession, type Page } from 'playwright-core';

/*
 * Times the transcript as a phone draws a long session (`bench/`): the
 * page built for production, in Chrome at a phone's size with its CPU
 * slowed four times, each move a few times over, the middle one kept.
 *
 *   pnpm bench                     every move, printed
 *   pnpm bench --out before.json   kept, to compare with later
 *   pnpm bench --compare before.json
 *   pnpm bench --profile open      where the time of one move goes
 *
 * Moves: `open`, a session drawn the first time; `reopen`, left and come
 * back to, as a phone does through the sidebar; `stream`, words arriving
 * at the end of a running turn; `toggle`, folds of work opened and shut;
 * `scroll`, from the bottom to the top, a step a frame; `sidebar`, on a
 * laptop's screen beside the App Shell's sidebar, shut and opened.
 */

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : (args[at + 1] ?? '');
};
const profile = flag('profile');
const RUNS = Number(flag('runs') ?? 3);
const THROTTLE = Number(flag('throttle') ?? 4);
const SIZES = (flag('turns') ?? '40,150').split(',').map(Number);

const app = join(import.meta.dirname, '..');
const dist = join(app, 'bench', 'dist');
execFileSync(
  'pnpm',
  [
    'exec',
    'vp',
    'build',
    '--config',
    'bench/vite.config.ts',
    ...(profile === undefined ? [] : ['--minify', 'false']),
  ],
  { cwd: app, stdio: ['ignore', 'ignore', 'inherit'] },
);

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const path = (request.url ?? '/').split('?')[0]!;
  const file = join(dist, path === '/' ? 'index.html' : path);
  try {
    const body = readFileSync(file);
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as { port: number }).port;

const browser = await chromium.launch({ channel: 'chrome', headless: true });

const median = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const p95 = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
  );
};

/** A fresh page with the bench loaded, phone-sized unless `wide`. */
const opened = async (wide = false) => {
  const context = await browser.newContext(
    wide
      ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }
      : {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
        },
  );
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => 'bench' in window);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  return { page, cdp, close: () => context.close() };
};

const heap = async (cdp: CDPSession) => {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 1024 / 1024;
};

type Result = Record<string, number>;

/** One run of every move on a session of `turns` turns. */
const run = async (turns: number): Promise<Result> => {
  const result: Result = {};
  {
    const { page, cdp, close } = await opened();
    const open = await page.evaluate(
      (turns) => window.bench.open(turns),
      turns,
    );
    result['open: drawn (ms)'] = open.draw;
    result['open: long tasks until quiet (ms)'] = open.busy;
    result['open: longest task after (ms)'] = open.longest;
    result['open: DOM nodes'] = open.nodes;
    result['open: JS heap (MB)'] = await heap(cdp);
    const reopen = await page.evaluate(() => window.bench.reopen());
    result['reopen: drawn (ms)'] = reopen.draw;
    result['reopen: long tasks until quiet (ms)'] = reopen.busy;
    result['reopen: longest task after (ms)'] = reopen.longest;
    const toggle = await page.evaluate(() => window.bench.toggle(4));
    result['toggle: median (ms)'] = median(toggle);
    result['toggle: worst (ms)'] = Math.max(...toggle);
    const scroll = await page.evaluate(() => window.bench.scroll(400));
    result['scroll: p95 frame (ms)'] = p95(scroll.frames);
    result['scroll: frames over 50 ms'] = scroll.frames.filter(
      (each) => each > 50,
    ).length;
    result['scroll: frames'] = scroll.frames.length;
    result['scroll: jumped on screen (px)'] = scroll.jumped;
    await close();
  }
  // Short turns draw shorter than they stood in, so the browser clamps the
  // scroll as they draw; the reader's place must hold through that too.
  for (const [name, by, short] of [
    ['near', 0.02, false],
    ['far', 0.5, false],
    ['short', 0.02, true],
  ] as const) {
    const { page, close } = await opened();
    const drift = await page.evaluate(
      ([turns, by, short]) => window.bench.drift(turns, by, short),
      [turns, by, short] as const,
    );
    // Scrolled while turns were still to be drawn, or there is nothing to tell.
    result[`drift ${name}: moved on screen (px)`] =
      drift.waiting === 0 ? 0 : Math.abs(drift.moved);
    result[`drift ${name}: still standing in (turns)`] = drift.left;
    await close();
  }
  {
    const { page, close } = await opened(true);
    await page.evaluate(
      (turns) => window.bench.open(turns, false, true),
      turns,
    );
    const frames = await page.evaluate(() => window.bench.sidebar(4));
    result['sidebar: p95 frame (ms)'] = p95(frames);
    result['sidebar: worst frame (ms)'] = Math.max(...frames);
    result['sidebar: frames over 50 ms'] = frames.filter(
      (each) => each > 50,
    ).length;
    await close();
  }
  {
    const { page, close } = await opened();
    await page.evaluate((turns) => window.bench.open(turns, true), turns);
    const stream = await page.evaluate(() => window.bench.stream(30));
    result['stream: median chunk (ms)'] = median(stream);
    result['stream: p95 chunk (ms)'] = p95(stream);
    await close();
  }
  return result;
};

/** Where the time of one move goes, by function, from a CPU profile. */
const profiled = async (move: string, turns: number) => {
  const { page, cdp, close } = await opened(move === 'sidebar');
  const before: Record<string, () => Promise<unknown>> = {
    open: async () => {},
    reopen: () => page.evaluate((turns) => window.bench.open(turns), turns),
    stream: () =>
      page.evaluate((turns) => window.bench.open(turns, true), turns),
    toggle: () => page.evaluate((turns) => window.bench.open(turns), turns),
    scroll: () => page.evaluate((turns) => window.bench.open(turns), turns),
    sidebar: () =>
      page.evaluate((turns) => window.bench.open(turns, false, true), turns),
  };
  const moves: Record<string, (page: Page) => Promise<unknown>> = {
    open: (page) => page.evaluate((turns) => window.bench.open(turns), turns),
    reopen: (page) => page.evaluate(() => window.bench.reopen()),
    stream: (page) => page.evaluate(() => window.bench.stream(30)),
    toggle: (page) => page.evaluate(() => window.bench.toggle(4)),
    scroll: (page) => page.evaluate(() => window.bench.scroll(400)),
    sidebar: (page) => page.evaluate(() => window.bench.sidebar(4)),
  };
  await before[move]!();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await moves[move]!(page);
  const { profile: data } = await cdp.send('Profiler.stop');
  await close();
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const self = new Map<number, number>();
  const deltas = data.timeDeltas ?? [];
  (data.samples ?? []).forEach((id, at) =>
    self.set(id, (self.get(id) ?? 0) + (deltas[at] ?? 0) / 1000),
  );
  const byFunction = new Map<string, number>();
  for (const [id, ms] of self) {
    const { callFrame } = nodes.get(id)!;
    const where = callFrame.url.split('/').pop() || '(native)';
    const name = `${callFrame.functionName || '(anonymous)'}  ${where}:${callFrame.lineNumber + 1}`;
    byFunction.set(name, (byFunction.get(name) ?? 0) + ms);
  }
  const total = [...byFunction.values()].reduce((a, b) => a + b, 0);
  console.log(`\n${move}, ${turns} turns: ${total.toFixed(0)} ms sampled`);
  for (const [name, ms] of [...byFunction]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40))
    console.log(`${ms.toFixed(1).padStart(9)} ms  ${name}`);
};

try {
  if (profile !== undefined) {
    for (const turns of SIZES) await profiled(profile || 'open', turns);
  } else {
    const results: Record<string, Result> = {};
    for (const turns of SIZES) {
      const runs: Result[] = [];
      for (let at = 0; at < RUNS; at++) runs.push(await run(turns));
      results[`${turns} turns`] = Object.fromEntries(
        Object.keys(runs[0]!).map((key) => [
          key,
          median(runs.map((each) => each[key]!)),
        ]),
      );
    }
    const compare = flag('compare');
    const old: Record<string, Result> | null =
      compare === undefined ? null : JSON.parse(readFileSync(compare, 'utf8'));
    for (const [size, result] of Object.entries(results)) {
      console.log(`\n${size} (CPU ${THROTTLE}x slower, 390x844)`);
      for (const [key, value] of Object.entries(result)) {
        const was = old?.[size]?.[key];
        const change =
          was === undefined
            ? ''
            : `   was ${was.toFixed(1)}${was === 0 ? '' : ` (${(((value - was) / was) * 100).toFixed(0)}%)`}`;
        console.log(
          `  ${key.padEnd(38)} ${value.toFixed(1).padStart(9)}${change}`,
        );
      }
    }
    const out = flag('out');
    if (out !== undefined) writeFileSync(out, JSON.stringify(results, null, 2));
  }
} finally {
  await browser.close();
  server.close();
}
