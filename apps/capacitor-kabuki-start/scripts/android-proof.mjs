// Usage: node scripts/android-proof.mjs <proof|offline> <out-dir>
//
// Drives the app's web view over the Chrome DevTools Protocol, with
// Playwright's Android support: it finds the web view's DevTools socket
// through adb. A plain connectOverCDP fails there, because Android's web view
// refuses the browser-wide calls (Browser.setDownloadBehavior) it makes.
//
// proof:   waits for the page's proof, reads every data-proof value, clicks
//          each buzz button (a CDP click is a real touch to the page, which
//          navigator.vibrate requires) and writes android-proof.json.
// offline: reads what the page drew after a relaunch with the network off
//          and writes offline.json.
//
// CDP_ENDPOINT, when set, drives a desktop Chromium instead, to try the
// script on a page without a device; SHELL_URL then picks the page.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _android as android, chromium } from 'playwright-core';

const [mode, out] = process.argv.slice(2);
if ((mode !== 'proof' && mode !== 'offline') || !out) {
  console.error('Usage: android-proof.mjs <proof|offline> <out-dir>');
  process.exit(2);
}
const PROOF_TIMEOUT = 60_000;
const BUZZES = ['impact', 'notify', 'selection'];

/** In desktop Chromium, the site's page, once it has loaded. */
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
  throw new Error('Chromium never showed the page.');
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

const APP = 'app.kishore.start';

/** The page in the app's web view, and how to let go of it. */
async function open() {
  if (process.env.CDP_ENDPOINT) {
    const browser = await chromium.connectOverCDP(process.env.CDP_ENDPOINT);
    return { page: await findPage(browser), close: () => browser.close() };
  }
  // The driver APK is for native UI, which this does not touch.
  const [device] = await android.devices({ omitDriverInstall: true });
  if (!device) throw new Error('adb lists no device.');
  const webView = await device.webView({ pkg: APP }, { timeout: 30_000 });
  // Leaves the app running: this only disconnects from adb.
  return { page: await webView.page(), close: () => device.close() };
}

const { page, close } = await open();
try {
  console.log(`Attached to ${page.url()}`);
  if (mode === 'proof') await proof(page);
  else await offline(page);
} finally {
  await close();
}
