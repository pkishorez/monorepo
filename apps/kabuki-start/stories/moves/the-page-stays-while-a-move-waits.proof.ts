import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  goto(url: string): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  route(
    url: string,
    handler: (route: { continue(): Promise<void> }) => Promise<void>,
  ): Promise<void>;
}

/** What the page shows while it waits: the place drawn, and the bar's destination. */
const waiting = () => ({
  places: Array.from(
    document.querySelectorAll<HTMLElement>('main [data-testid^="place:"]'),
    (each) => each.dataset.testid,
  ),
  pending:
    document.querySelector<HTMLElement>('[data-testid=pending]')?.dataset
      .pending ?? null,
  address: location.pathname,
});

export default Proof.browser({
  title:
    'While a move waits on its Input, the page stays and a bar says where it is going',
  description:
    'Answers from /_kabuki/load are held back for a second and a half: until the post arrives the list stays drawn and the progress bar names the post, then the post replaces it and the bar goes.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      yield* tab.raw(
        'Open /blog, on a slow network for /_kabuki/load',
        async (raw) => {
          const page = raw as Page;
          await page.route('**/_kabuki/load', async (route) => {
            await new Promise((done) => setTimeout(done, 1500));
            await route.continue();
          });
          await page.goto(`${SITE}/blog`);
          await page.waitForSelector('[data-testid=runtime][data-live=true]');
        },
      );
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.click(
        'Open the post "Every Loader at once"',
        'main a[href="/blog/loaders-at-once"]',
      );
      yield* Effect.sleep('400 millis');
      const during = yield* tab.evaluate(waiting);
      yield* tab.screenshot('Waiting: the list stays, the bar runs');
      yield* tab.waitFor('The post arrives', '[data-testid="place:Blog.Post"]');
      yield* Effect.sleep('300 millis');
      const after = yield* tab.evaluate(waiting);
      return { during, after };
    }),
  verify: ({ during, after }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `while waiting, the list is still drawn (${during.places.join(', ')})`,
        JSON.stringify(during.places) === '["place:Blog.Index"]',
      );
      yield* Proof.assert(
        `and the bar names the post (${during.pending})`,
        during.pending === '/blog/loaders-at-once',
      );
      yield* Proof.assert(
        `once it arrives the post is drawn (${after.places.join(', ')}) at its address (${after.address})`,
        JSON.stringify(after.places) === '["place:Blog.Post"]' &&
          after.address === '/blog/loaders-at-once',
      );
      yield* Proof.assert('and the bar is gone', after.pending === null);
    }),
});
