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
  waitForSelector(selector: string): Promise<unknown>;
  waitForFunction(fn: string): Promise<unknown>;
}

/** The tab's title, its canonical links and its og:title, as the document has them now. */
const head = () => ({
  title: document.title,
  canonicals: Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel=canonical]'),
    (link) => link.getAttribute('href'),
  ),
  ogTitle:
    document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute('content') ?? null,
});

type Head = ReturnType<typeof head>;

export default Proof.browser({
  title: 'The tab title and canonical URL follow every move',
  description:
    'After the first page the browser writes the Metadata itself: Home, then the blog, then a post, then Back, each time with one canonical link and the right Open Graph title.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      yield* tab.raw('Open /', async (raw) => {
        const page = raw as Page;
        await page.goto(`${SITE}/`);
        await page.waitForSelector('[data-testid=runtime][data-live=true]');
      });
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const seen: Head[] = [yield* tab.evaluate(head)];
      yield* tab.click('Open Blog', 'nav a[href="/blog"]');
      yield* tab.waitFor('The blog', '[data-testid="place:Blog.Index"]');
      seen.push(yield* tab.evaluate(head));
      yield* tab.click(
        'Open "Every Loader at once"',
        'main a[href="/blog/loaders-at-once"]',
      );
      yield* tab.waitFor('The post', '[data-testid="place:Blog.Post"]');
      seen.push(yield* tab.evaluate(head));
      yield* tab.raw('Back', async (raw) => {
        const page = raw as Page;
        await page.goBack();
        await page.waitForSelector('[data-testid="place:Blog.Index"]');
        await page.waitForFunction(`document.title.startsWith('Blog ')`);
      });
      seen.push(yield* tab.evaluate(head));
      return seen;
    }),
  verify: (seen) =>
    Effect.gen(function* () {
      const expected = [
        ['Home', '/'],
        ['Blog', '/blog'],
        ['Every Loader at once', '/blog/loaders-at-once'],
        ['Blog', '/blog'],
      ] as const;
      for (const [index, [title, path]] of expected.entries()) {
        const now = seen[index]!;
        yield* Proof.assert(
          `${index === 3 ? 'after Back' : `at ${path}`}: "${now.title}", canonical ${now.canonicals.join(' + ')}, og:title "${now.ogTitle}"`,
          now.title === `${title} · Kabuki Start` &&
            JSON.stringify(now.canonicals) ===
              JSON.stringify([`https://start.kishore.app${path}`]) &&
            now.ogTitle === title,
        );
      }
    }),
});
