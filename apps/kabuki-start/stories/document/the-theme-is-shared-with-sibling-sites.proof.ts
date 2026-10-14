import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/**
 * The domain the site shares with its siblings, as `pr66-start.kishore.app`
 * shares `kishore.app` with the docs; the host itself where it has none.
 */
const host = new URL(SITE).hostname;
const parent =
  host.split('.').length > 2 && !/^[\d.]+$/.test(host)
    ? host.split('.').slice(1).join('.')
    : undefined;
const shared = parent ?? host;

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<R>(fn: string): Promise<R>;
  context(): {
    addCookies(
      cookies: ReadonlyArray<{
        name: string;
        value: string;
        domain: string;
        path: string;
      }>,
    ): Promise<void>;
  };
}

/** The theme of `<html>` and every kui-theme cookie the page sees. */
const NOW = `({
  theme: (document.documentElement.dataset.theme ?? '') + '/' + (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  kept: document.cookie.split('; ').filter((part) => part.startsWith('kui-theme=')).map((part) => part.slice(10)),
})`;

interface Now {
  readonly theme: string;
  readonly kept: ReadonlyArray<string>;
}

const open = (page: Page, reload: boolean) =>
  (reload ? page.reload() : page.goto(`${SITE}/about`))
    .then(() => page.waitForSelector('[data-testid=runtime][data-live=true]'))
    .then(() => page.evaluate<Now>(NOW));

export default Proof.browser({
  title: 'The theme is shared with the sibling sites, and a pick here holds',
  description: `A theme picked on a sibling site, kept in a kui-theme cookie for the whole of ${shared}, opens this one in it. A pick here is kept in that same cookie, not in a second one beside it, so it is not read back from the other and undone.`,
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const start = yield* tab.raw(
        `Open /about, light kept for ${shared}`,
        async (raw) => {
          const page = raw as Page;
          await page.context().addCookies([
            // A leading dot: the cookie is every subdomain's too.
            {
              name: 'kui-theme',
              value: 'light',
              domain: parent ? `.${parent}` : host,
              path: '/',
            },
          ]);
          return open(page, false);
        },
      );
      return { tab, start };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.click('Switch to dark', 'nav button');
      const settled = yield* tab.raw('Wait a moment', async (raw) => {
        const page = raw as Page;
        await page.waitForTimeout(500);
        return page.evaluate<Now>(NOW);
      });
      yield* tab.screenshot('Dark, and still dark');
      const reloaded = yield* tab.raw('Reload', (raw) =>
        open(raw as Page, true),
      );
      return { settled, reloaded };
    }),
  verify: ({ settled, reloaded }, { start }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the page opens in the sibling's pick, light (${start.theme})`,
        start.theme === 'light/light',
      );
      yield* Proof.assert(
        `the button switches it to dark, and it stays dark (${settled.theme})`,
        settled.theme === 'dark/dark',
      );
      yield* Proof.assert(
        `kept in the one shared cookie (${settled.kept.join(', ')})`,
        settled.kept.length === 1 && settled.kept[0] === 'dark',
      );
      yield* Proof.assert(
        `and a reload opens dark (${reloaded.theme})`,
        reloaded.theme === 'dark/dark',
      );
    }),
});
