import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  goto(url: string): Promise<unknown>;
  goBack(): Promise<unknown>;
  goForward(): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  waitForURL(url: string): Promise<unknown>;
  on(
    event: 'request',
    listener: (request: { method(): string; url(): string }) => void,
  ): void;
}

/** The title of the place drawn now. */
const heading = () => document.querySelector('main h1')?.textContent ?? '';

export default Proof.browser({
  title:
    'Back and Forward draw what was loaded before, asking the server nothing',
  description:
    'Each history entry keeps the Inputs its places were drawn from, so going back through two posts and the list, then forward again, sends no request to /_kabuki/load and no page request.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const asked: string[] = [];
      yield* tab.raw('Open /blog', async (raw) => {
        const page = raw as Page;
        page.on('request', (request) => {
          const url = new URL(request.url());
          // A Loader call, or a page; not a file, nor what the CDN adds under /cdn-cgi/.
          if (
            url.origin === new URL(SITE).origin &&
            (url.pathname === '/_kabuki/load' ||
              (request.method() === 'GET' &&
                !/\.\w+$/.test(url.pathname) &&
                !url.pathname.startsWith('/cdn-cgi/')))
          )
            asked.push(`${request.method()} ${url.pathname}`);
        });
        await page.goto(`${SITE}/blog`);
        await page.waitForSelector('[data-testid=runtime][data-live=true]');
      });
      yield* tab.click(
        'Open "Drawn once, per deploy"',
        'main a[href="/blog/drawn-once"]',
      );
      yield* tab.waitFor(
        'The first post is drawn',
        'h1:text("Drawn once, per deploy")',
      );
      yield* tab.click('Back to all posts', 'main a[href="/blog"]');
      yield* tab.waitFor(
        'The list is drawn',
        '[data-testid="place:Blog.Index"]',
      );
      yield* tab.click(
        'Open "Back is free"',
        'main a[href="/blog/back-is-free"]',
      );
      yield* tab.waitFor('The second post is drawn', 'h1:text("Back is free")');
      return {
        tab,
        asked,
        before: asked.length,
        loads: asked.filter((each) => each.endsWith(' /_kabuki/load')).length,
      };
    }),
  act: ({ tab, asked, before }) =>
    Effect.gen(function* () {
      const headings: string[] = [];
      const step = (
        name: string,
        move: (page: Page) => Promise<unknown>,
        path: string,
      ) =>
        Effect.gen(function* () {
          yield* tab.raw(name, async (raw) => {
            const page = raw as Page;
            await move(page);
            await page.waitForURL(`${SITE}${path}`);
          });
          yield* Effect.sleep('200 millis');
          headings.push(yield* tab.evaluate(heading));
        });
      yield* step('Back', (page) => page.goBack(), '/blog');
      yield* step('Back', (page) => page.goBack(), '/blog/drawn-once');
      yield* step('Back', (page) => page.goBack(), '/blog');
      yield* step('Forward', (page) => page.goForward(), '/blog/drawn-once');
      yield* step('Forward', (page) => page.goForward(), '/blog');
      yield* step('Forward', (page) => page.goForward(), '/blog/back-is-free');
      yield* Effect.sleep('300 millis');
      return { headings, after: asked.slice(before) };
    }),
  verify: ({ headings, after }, { loads }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the two posts were loaded once each (${loads} loads)`,
        loads === 2,
      );
      yield* Proof.assert(
        `Back and Forward drew each entry again (${headings.join(' → ')})`,
        JSON.stringify(headings) ===
          JSON.stringify([
            'Blog',
            'Drawn once, per deploy',
            'Blog',
            'Drawn once, per deploy',
            'Blog',
            'Back is free',
          ]),
      );
      yield* Proof.assert(
        `and asked the server nothing${after.length ? ` (${after.join(', ')})` : ''}`,
        after.length === 0,
      );
    }),
});
