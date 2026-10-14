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
}

/** Where the tab is, what it is titled, and which places it draws. */
const here = () => ({
  address: location.pathname,
  title: document.title,
  places: Array.from(
    document.querySelectorAll<HTMLElement>('main [data-testid^="place:"]'),
    (each) => each.dataset.testid,
  ).join(', '),
});

export default Proof.browser({
  title: 'A click to a missing page or a private one lands somewhere sensible',
  description:
    'After the first page the browser loads each move itself: a post that is not there draws the not-found page, and the account, signed out, is replaced by sign-in, so Back skips it.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Visitor');
      yield* tab.raw('Open /blog', async (raw) => {
        const page = raw as Page;
        await page.goto(`${SITE}/blog`);
        await page.waitForSelector('[data-testid=runtime][data-live=true]');
      });
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.click(
        'Open "A post that is not there"',
        'main a[href="/blog/missing"]',
      );
      yield* tab.waitFor(
        'The not-found page',
        '[data-testid="place:NotFound"]',
      );
      const missing = yield* tab.evaluate(here);
      yield* tab.click('Open Account, signed out', 'nav a[href="/account"]');
      yield* tab.waitFor('Sign in instead', '[data-testid="place:SignIn"]');
      const signIn = yield* tab.evaluate(here);
      yield* tab.raw('Back', async (raw) => {
        const page = raw as Page;
        await page.goBack();
        await page.waitForSelector('[data-testid="place:NotFound"]');
      });
      const back = yield* tab.evaluate(here);
      return { missing, signIn, back };
    }),
  verify: ({ missing, signIn, back }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the missing post draws the not-found page (${missing.places}) at ${missing.address}`,
        missing.places === 'place:NotFound' &&
          missing.address === '/blog/missing',
      );
      yield* Proof.assert(
        `titled "${missing.title}"`,
        missing.title === 'Not found · Kabuki Start',
      );
      yield* Proof.assert(
        `the account, signed out, lands on sign-in (${signIn.places}) at ${signIn.address}`,
        signIn.places === 'place:SignIn' && signIn.address === '/sign-in',
      );
      yield* Proof.assert(
        `Back skips the account and returns to ${back.address}`,
        back.address === '/blog/missing',
      );
    }),
});
