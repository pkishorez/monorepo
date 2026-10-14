import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  addInitScript(script: string): Promise<void>;
  evaluate<R>(fn: string): Promise<R>;
}

/** The theme of `<html>`: its `data-theme`, and whether it has the `dark` class. */
const NOW = `(document.documentElement.dataset.theme ?? '') + '/' + (document.documentElement.classList.contains('dark') ? 'dark' : 'light')`;

/** Notes the theme of `<html>` when the parser first makes `<body>`, before anything is painted. */
const WATCH = `new MutationObserver((_, observer) => {
  if (!document.body) return;
  window.__atBody = ${NOW};
  observer.disconnect();
}).observe(document, { childList: true, subtree: true });`;

/** The theme of `<html>` when the body started, after a full load of `path` (or a reload). */
const load = (page: Page, path: string | null) =>
  (path === null ? page.reload() : page.goto(`${SITE}${path}`))
    .then(() => page.waitForSelector('[data-testid=runtime][data-live=true]'))
    .then(() => page.evaluate<string>('window.__atBody'));

/** The theme of `<html>` now, and what the kui-theme cookie keeps. */
const now = () => ({
  theme: `${document.documentElement.dataset.theme ?? ''}/${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`,
  kept: /(?:^|; )kui-theme=([^;]*)/.exec(document.cookie)?.[1] ?? null,
});

export default Proof.browser({
  title: 'The theme you pick stays picked across reloads and pages',
  description:
    'With nothing kept the site opens dark. The theme button in the nav switches to light and keeps it in the kui-theme cookie: a reload and another page open light from the first paint. Switching back to dark is kept the same way.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const start = yield* tab.raw('Open /, nothing kept', async (raw) => {
        const page = raw as Page;
        await page.addInitScript(WATCH);
        return load(page, '/');
      });
      return { tab, start };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.click('Switch to light', 'nav button');
      const toggled = yield* tab.evaluate(now);
      const reloaded = yield* tab.raw('Reload', (raw) =>
        load(raw as Page, null),
      );
      const elsewhere = yield* tab.raw('Open /about', (raw) =>
        load(raw as Page, '/about'),
      );
      yield* tab.screenshot('Still light on /about');
      yield* tab.click('Switch back to dark', 'nav button');
      const back = yield* tab.evaluate(now);
      const reloadedDark = yield* tab.raw('Reload', (raw) =>
        load(raw as Page, null),
      );
      return { toggled, reloaded, elsewhere, back, reloadedDark };
    }),
  verify: ({ toggled, reloaded, elsewhere, back, reloadedDark }, { start }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the page opens dark, with nothing kept (${start})`,
        start === 'dark/dark',
      );
      yield* Proof.assert(
        `the button switches it to light (${toggled.theme}) and keeps light in the cookie (${toggled.kept})`,
        toggled.theme === 'light/light' && toggled.kept === 'light',
      );
      yield* Proof.assert(
        `a reload opens light from the first paint (${reloaded})`,
        reloaded === 'light/light',
      );
      yield* Proof.assert(
        `so does another page, /about (${elsewhere})`,
        elsewhere === 'light/light',
      );
      yield* Proof.assert(
        `the button switches back to dark (${back.theme}) and keeps it (${back.kept})`,
        back.theme === 'dark/dark' && back.kept === 'dark',
      );
      yield* Proof.assert(
        `and a reload opens dark (${reloadedDark})`,
        reloadedDark === 'dark/dark',
      );
    }),
});
