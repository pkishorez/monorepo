// Usage: node scripts/android-proof.mjs <proof|offline> <out-dir>
//
// Drives the app's web view over the Chrome DevTools Protocol, through
// `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`.
//
// proof:   waits for the page's proof, reads every data-proof value, clicks
//          each buzz button (a CDP click is a real touch to the page, which
//          navigator.vibrate requires) and writes android-proof.json.
// offline: reads what the page drew after a relaunch with the network off
//          and writes offline.json.
//
// SHELL_URL, when set, picks the page on its origin. CDP_ENDPOINT overrides
// the endpoint. Android's web view serves its browser
// target at /devtools/browser, the path Playwright's own Android support uses.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const [mode, out] = process.argv.slice(2);
if ((mode !== 'proof' && mode !== 'offline') || !out) {
  console.error('Usage: android-proof.mjs <proof|offline> <out-dir>');
  process.exit(2);
}
const endpoint =
  process.env.CDP_ENDPOINT ?? 'ws://127.0.0.1:9222/devtools/browser';
const PROOF_TIMEOUT = 60_000;
const BUZZES = ['impact', 'notify', 'selection'];

/** The site's page, once the web view has loaded it. */
async function findPage(browser) {
  const origin = process.env.SHELL_URL
    ? new URL(process.env.SHELL_URL).origin
    : 'http';
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    const page = pages.find((page) => page.url().startsWith(origin));
    if (page) return page;
    await sleep(500);
  }
  throw new Error('The web view never showed a page.');
}

/** Every data-proof element's text, by name. */
const readProof = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll('[data-proof]')].map((element) => [
        element.getAttribute('data-proof'),
        element.textContent.trim(),
      ]),
    ),
  );

const waitForValue = (page, name, accept, timeout) =>
  page
    .waitForFunction(
      ([name, accept]) =>
        accept.includes(
          document.querySelector(`[data-proof="${name}"]`)?.textContent.trim(),
        ),
      [name, accept],
      { timeout, polling: 250 },
    )
    .then(
      () => true,
      () => false,
    );

async function proof(page) {
  let proofLine = null;
  page.on('console', (message) => {
    if (message.text().includes('[native-proof] ')) proofLine = message.text();
  });

  const done = await waitForValue(page, 'done', ['yes'], PROOF_TIMEOUT);
  const before = await readProof(page);

  const clicks = {};
  for (const name of BUZZES) {
    const button = page.locator(`[data-proof="buzz-${name}"]`);
    if ((await button.count()) === 0) {
      clicks[name] = 'no button';
      continue;
    }
    await button.click({ timeout: 10_000 });
    // A refused buzz may stay refused, so wait for took and then read.
    await waitForValue(page, `buzz-${name}-result`, ['took'], 3_000);
    clicks[name] = (await readProof(page))[`buzz-${name}-result`] ?? 'missing';
  }

  // The service worker may settle after the proof: give it a little longer,
  // since the offline check needs it in control.
  await waitForValue(page, 'service-worker', ['controlling'], 20_000);
  const after = await readProof(page);

  await page.screenshot({ path: join(out, 'webview.png') }).catch(() => {});
  const result = { url: page.url(), done, proofLine, before, clicks, after };
  writeFileSync(
    join(out, 'android-proof.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
}

async function offline(page) {
  // The page drew if its own platform field shows up; a network error page
  // has none.
  const drew = await waitForValue(
    page,
    'platform',
    ['android', 'ios', 'web', 'checking'],
    20_000,
  );
  const values = await readProof(page);
  const title = await page.title().catch(() => '');
  const result = {
    url: page.url(),
    title,
    drew,
    values,
    result: drew
      ? `drew (service worker ${values['service-worker'] ?? '?'})`
      : `did not draw (title: ${title || 'none'})`,
  };
  await page
    .screenshot({ path: join(out, 'offline-webview.png') })
    .catch(() => {});
  writeFileSync(
    join(out, 'offline.json'),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
try {
  const page = await findPage(browser);
  console.log(`Attached to ${page.url()}`);
  if (mode === 'proof') await proof(page);
  else await offline(page);
} finally {
  // Leaves the app running: closing a CDP connection does not close the app.
  await browser.close();
}
