import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { scenarios, type Scenario } from './scenarios/index.ts';
import { Walk } from './walker.ts';

/*
 * The fake walk: Code in fake mode driven like a person, in a headless
 * Chromium, through the app's own clicks and keys and the fake bubble's
 * Controls, a screenshot at each step that matters.
 *
 *   VITE_MODE=fake pnpm exec vp dev --port 5199   fake mode, elsewhere
 *   pnpm walk                       every scenario, in order
 *   pnpm walk sessions computers    those, and the ones they need
 *   pnpm walk --list                the scenarios
 *
 * Flags: `--url` (the dev server, default http://localhost:5199/; `pnpm
 * dev`'s Portless address works too), `--shots` (folder, default
 * /tmp/fake-mode-shots), `--prefix` (each screenshot's, default `walk`),
 * `--chromium` (its path, default /usr/bin/chromium), `--headed`, `--list`.
 *
 * One page walks every scenario asked, in the order of `scenarios/`, as one
 * person would: each scenario starts where the ones it needs left the app,
 * and says what it needs. The browser starts with nothing kept, so the
 * world is blank. A reload keeps the world, as `reload` checks; `start-fresh`
 * makes it blank again. A step that fails stops the walk, with a
 * screenshot of where; the errors the page logged are listed at the end.
 */

const args = process.argv.slice(2);
const flag = (name: string, otherwise: string) => {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return otherwise;
  const [value] = args.splice(at, 2).slice(1);
  return value ?? otherwise;
};
const toggle = (name: string) => {
  const at = args.indexOf(`--${name}`);
  if (at !== -1) args.splice(at, 1);
  return at !== -1;
};
const URL_AT = flag('url', 'http://localhost:5199/');
const SHOTS = flag('shots', '/tmp/fake-mode-shots');
const PREFIX = flag('prefix', 'walk');
const CHROMIUM = flag('chromium', '/usr/bin/chromium');
const HEADED = toggle('headed');

if (toggle('list')) {
  for (const one of scenarios)
    console.log(`${one.name.padEnd(12)} ${one.title}`);
  process.exit(0);
}

/** Each scenario asked for, after those it needs, in the order of `scenarios/`. */
const chosen = (names: ReadonlyArray<string>): ReadonlyArray<Scenario> => {
  if (names.length === 0) return scenarios;
  const wanted = new Set<string>();
  const add = (name: string) => {
    const one = scenarios.find((scenario) => scenario.name === name);
    if (one === undefined) throw new Error(`No scenario ${name}`);
    for (const need of one.needs) add(need);
    wanted.add(name);
  };
  for (const name of names) add(name);
  return scenarios.filter((one) => wanted.has(one.name));
};

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  headless: !HEADED,
  // No page kept for Back: each page left would hold the dev server's
  // thousands of modules, and a walk that reloads often is killed where
  // memory is tight.
  args: [
    '--disable-features=BackForwardCache',
    '--js-flags=--max-old-space-size=640',
  ],
});
const problems: Array<string> = [];
let failed = false;
try {
  mkdirSync(SHOTS, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  // Every module over the network, never from the HTTP cache: a reload
  // reading the dev server's thousands of modules from the cache at once
  // takes gigabytes of shared memory for a moment, and the browser is
  // killed where memory is tight.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('__devtools'))
      problems.push(`console: ${text}`);
  });
  const walk = new Walk(page, {
    url: URL_AT,
    shots: SHOTS,
    prefix: PREFIX,
  });
  for (const scenario of chosen(args)) {
    walk.scenario = scenario.name;
    console.log(`\n# ${scenario.name}: ${scenario.title}`);
    try {
      await scenario.run(walk);
    } catch (error) {
      await walk.shot('failed', { bubble: true }).catch(() => undefined);
      throw error;
    }
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  if (problems.length > 0) {
    console.log(`\n${problems.length} errors the page logged:`);
    for (const problem of problems.slice(0, 40)) console.log(`  ${problem}`);
  }
}
process.exit(failed ? 1 : 0);
