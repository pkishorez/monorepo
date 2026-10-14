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
  waitForFunction(fn: string): Promise<unknown>;
  evaluate<R>(fn: string): Promise<R>;
  context(): {
    addCookies(
      cookies: ReadonlyArray<{ name: string; value: string; url: string }>,
    ): Promise<void>;
  };
  on(
    event: 'console',
    listener: (message: { type(): string; text(): string }) => void,
  ): void;
  on(event: 'pageerror', listener: (error: Error) => void): void;
}

/** Every provenance badge on the page, as its data attributes say. */
const BADGES = `[...document.querySelectorAll('[data-testid=provenance]')].map((each) => ({
  place: each.dataset.place, drawn: each.dataset.drawn, input: each.dataset.input,
}))`;

interface Badge {
  readonly place: string;
  readonly drawn: string;
  readonly input: string;
}

const PAGES = [
  '/',
  '/blog/drawn-once',
  '/docs/loaders',
  '/account/settings',
  '/shop/cart',
];

export default Proof.browser({
  title:
    'Every first page arrives drawn and the browser takes over without an error',
  description:
    'For a static page, a nested static one, a signed-in dynamic one and a dynamic one under a static one: every badge says the server drew it with the Input that came with the page, the Runtime starts, and the console stays clean.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const problems: string[] = [];
      yield* tab.raw(
        'Sign in as Grace and add a mug to the cart',
        async (raw) => {
          const page = raw as Page;
          page.on('console', (message) => {
            if (message.type() === 'error' || message.type() === 'warning')
              problems.push(`${message.type()}: ${message.text()}`);
          });
          page.on('pageerror', (error) =>
            problems.push(`page error: ${error.message}`),
          );
          await page.context().addCookies([
            { name: 'session', value: 'Grace', url: SITE },
            { name: 'cart', value: 'mug', url: SITE },
          ]);
        },
      );
      return { tab, problems };
    }),
  act: ({ tab, problems }) =>
    Effect.gen(function* () {
      const seen: Array<{
        readonly path: string;
        readonly badges: Badge[];
        readonly live: boolean;
      }> = [];
      for (const path of PAGES) {
        const visit = yield* tab.raw(`Open ${path}`, async (raw) => {
          const page = raw as Page;
          await page.goto(`${SITE}${path}`);
          await page.waitForSelector('[data-testid=runtime][data-live=true]');
          return {
            path,
            badges: await page.evaluate<Badge[]>(BADGES),
            live: true,
          };
        });
        seen.push(visit);
      }
      return { seen, problems: [...problems] };
    }),
  verify: ({ seen, problems }) =>
    Effect.gen(function* () {
      for (const { path, badges, live } of seen) {
        yield* Proof.assert(
          `${path}: ${badges.length} places, each drawn by the server (${badges.map((each) => `${each.place} ${each.drawn}/${each.input}`).join(', ')})`,
          badges.length > 0 && badges.every((each) => each.drawn === 'server'),
        );
        yield* Proof.assert(
          `${path}: every Input came with the page`,
          badges.every(
            (each) => each.input === 'server' || each.input === 'none',
          ),
        );
        yield* Proof.assert(`${path}: the Runtime started`, live);
      }
      yield* Proof.assert(
        `no console error or warning${problems.length ? `: ${problems.join(' | ')}` : ''}`,
        problems.length === 0,
      );
    }),
});
