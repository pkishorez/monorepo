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
  evaluate<R>(fn: string): Promise<R>;
  addInitScript(script: string): Promise<void>;
  emulateMedia(options: { colorScheme: 'light' | 'dark' }): Promise<void>;
  on(
    event: 'console',
    listener: (message: { type(): string; text(): string }) => void,
  ): void;
}

/** The theme `<html>` is in: its `data-theme`, and whether it has the `dark` class. */
const NOW = `(document.documentElement.dataset.theme ?? '') + '/' + (document.documentElement.classList.contains('dark') ? 'dark' : 'light')`;

/**
 * Runs before any script of the page: notes the theme of `<html>` when the
 * parser first makes `<body>`, before anything can be painted, and on the
 * first animation frame, before the first paint.
 */
const WATCH = `window.__theme = {};
new MutationObserver((_, observer) => {
  if (!document.body) return;
  window.__theme.atBody = ${NOW};
  window.__theme.hydratedAtBody = !!document.querySelector('[data-testid=runtime][data-live=true]');
  observer.disconnect();
}).observe(document, { childList: true, subtree: true });
requestAnimationFrame(() => { window.__theme.firstFrame = ${NOW}; });`;

interface Seen {
  readonly atBody: string;
  readonly hydratedAtBody: boolean;
  readonly firstFrame: string;
  readonly after: string;
}

const read = (page: Page) =>
  page
    .waitForSelector('[data-testid=runtime][data-live=true]')
    .then(() => page.evaluate<Seen>(`({ ...window.__theme, after: ${NOW} })`));

export default Proof.browser({
  title: 'A page opens in your theme, with no flash of the other one',
  description:
    'The Theme script in the Document reads the kui-theme cookie and puts the theme on <html>, the dark class and data-theme, before the body is parsed, on a static page from the cache too: dark with nothing kept, whatever the system says, or light when light is kept, on a dark system.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const fresh = yield* browser.open('desktop', 'Nothing kept');
      const kept = yield* browser.open('desktop', 'Kept light');
      const problems: string[] = [];
      for (const tab of [fresh, kept])
        yield* tab.raw(
          'Watch the theme of <html> from the first byte',
          async (raw) => {
            const page = raw as Page;
            page.on('console', (message) => {
              if (message.type() === 'error' || message.type() === 'warning')
                problems.push(message.text());
            });
            await page.addInitScript(WATCH);
          },
        );
      return { fresh, kept, problems };
    }),
  act: ({ fresh, kept, problems }) =>
    Effect.gen(function* () {
      const nothing = yield* fresh.raw(
        'Open /blog on a light system, with nothing kept',
        async (raw) => {
          const page = raw as Page;
          await page.emulateMedia({ colorScheme: 'light' });
          await page.goto(`${SITE}/blog`);
          return read(page);
        },
      );
      yield* fresh.screenshot('Dark from the first paint');
      const light = yield* kept.raw(
        'Keep light in the kui-theme cookie on a dark system, then reload /blog',
        async (raw) => {
          const page = raw as Page;
          await page.emulateMedia({ colorScheme: 'dark' });
          await page.goto(`${SITE}/blog`);
          await page.evaluate(
            `document.cookie = 'kui-theme=light; Path=/; SameSite=Lax'`,
          );
          await page.reload();
          return read(page);
        },
      );
      yield* kept.screenshot('Light from the first paint');
      return { nothing, light, problems: [...problems] };
    }),
  verify: ({ nothing, light, problems }) =>
    Effect.gen(function* () {
      for (const [who, seen, theme] of [
        ['nothing kept, light system', nothing, 'dark'],
        ['light kept, dark system', light, 'light'],
      ] as const) {
        const want = `${theme}/${theme}`;
        yield* Proof.assert(
          `${who}: <html> is ${theme} when the body starts (${seen.atBody})`,
          seen.atBody === want && !seen.hydratedAtBody,
        );
        yield* Proof.assert(
          `and on the first frame (${seen.firstFrame})`,
          seen.firstFrame === want,
        );
        yield* Proof.assert(
          `and still after hydration (${seen.after})`,
          seen.after === want,
        );
      }
      yield* Proof.assert(
        `React does not complain that <html> changed${problems.length ? `: ${problems.join(' | ')}` : ''}`,
        problems.length === 0,
      );
    }),
});
