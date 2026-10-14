import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  goto(url: string): Promise<{ status(): number } | null>;
  waitForSelector(selector: string): Promise<unknown>;
  fill(selector: string, text: string): Promise<void>;
  url(): string;
}

const opened = (page: Page, path: string) =>
  page.goto(`${SITE}${path}`).then(async () => {
    await page.waitForSelector('[data-testid=runtime][data-live=true]');
    return new URL(page.url()).pathname;
  });

/** Who the account says is signed in, and how its badge came to be. */
const account = () => ({
  viewer: document.querySelector('[data-testid=viewer]')?.textContent ?? null,
  badge: (() => {
    const badge = document.querySelector<HTMLElement>(
      '[data-testid=provenance][data-place=Account]',
    );
    return badge ? `${badge.dataset.drawn}/${badge.dataset.input}` : null;
  })(),
  address: location.pathname,
});

export default Proof.browser({
  title: 'Signing in opens your account, and signing out closes it',
  description:
    'The sign-in page writes the session cookie and moves to the account, whose Input the browser fetches with that cookie. Signing out clears it, and asking for /account again is sent back to /sign-in by the server.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Lin');
      const start = yield* tab.raw('Open /sign-in', (raw) =>
        opened(raw as Page, '/sign-in'),
      );
      return { tab, start };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.raw('Type the name Lin', (raw) =>
        (raw as Page).fill('input[name=name]', 'Lin'),
      );
      yield* tab.click('Sign in', 'form button[type=submit]');
      yield* tab.waitFor(
        'The account opens',
        '[data-testid="place:Account.Overview"]',
      );
      const signedIn = yield* tab.evaluate(account);
      yield* tab.click('Sign out', 'button:text("Sign out")');
      yield* tab.waitFor('Back at sign in', '[data-testid="place:SignIn"]');
      const signedOut = yield* tab.evaluate(() => location.pathname);
      const again = yield* tab.raw('Open /account again', (raw) =>
        opened(raw as Page, '/account'),
      );
      return { signedIn, signedOut, again };
    }),
  verify: ({ signedIn, signedOut, again }, { start }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the visit starts at /sign-in (${start})`,
        start === '/sign-in',
      );
      yield* Proof.assert(
        `signing in opens /account as Lin (${signedIn.address}, ${signedIn.viewer})`,
        signedIn.address === '/account' && signedIn.viewer === 'Lin',
      );
      yield* Proof.assert(
        `the account was drawn by the browser from the Input it fetched (${signedIn.badge})`,
        signedIn.badge === 'browser/browser',
      );
      yield* Proof.assert(
        `signing out goes to /sign-in (${signedOut})`,
        signedOut === '/sign-in',
      );
      yield* Proof.assert(
        `and /account now lands on /sign-in (${again})`,
        again === '/sign-in',
      );
    }),
});
