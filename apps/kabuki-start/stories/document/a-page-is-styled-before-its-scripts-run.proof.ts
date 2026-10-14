import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  context(): {
    browser(): {
      newContext(options: { javaScriptEnabled: boolean }): Promise<{
        newPage(): Promise<Page>;
        close(): Promise<void>;
      }>;
    } | null;
  };
  goto(url: string, options?: { waitUntil: 'load' }): Promise<unknown>;
  evaluate<R>(fn: string): Promise<R>;
}

/** What the page looks like with no script of its own run: its styles, as the browser computed them. */
const LOOKS = `(() => {
  const body = getComputedStyle(document.body);
  return {
    stylesheets: [...document.querySelectorAll('head link[rel=stylesheet]')].map((each) => each.getAttribute('href')),
    font: body.fontFamily,
    background: body.backgroundColor,
    header: getComputedStyle(document.querySelector('header')).position,
    drawn: !!document.querySelector('[data-testid="place:Blog.Index"]'),
    started: !!document.querySelector('[data-testid=runtime][data-live=true]'),
  };
})()`;

interface Looks {
  readonly stylesheets: ReadonlyArray<string>;
  readonly font: string;
  readonly background: string;
  readonly header: string;
  readonly drawn: boolean;
  readonly started: boolean;
}

export default Proof.browser({
  title: 'A page is styled before any of its scripts run',
  description:
    'With JavaScript off, /blog still arrives drawn and styled: its head links the stylesheet, so the body has the Web Platform font and background, and the header is sticky, all before a script could run.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const looks = yield* tab.raw(
        'Open /blog with JavaScript off',
        async (raw) => {
          const browser = (raw as Page).context().browser();
          if (!browser) throw new Error('no browser to open a context in');
          const context = await browser.newContext({
            javaScriptEnabled: false,
          });
          try {
            const page = await context.newPage();
            await page.goto(`${SITE}/blog`, { waitUntil: 'load' });
            return await page.evaluate<Looks>(LOOKS);
          } finally {
            await context.close();
          }
        },
      );
      return { looks };
    }),
  verify: ({ looks }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the page arrives drawn, and no script of it ran',
        looks.drawn && !looks.started,
      );
      yield* Proof.assert(
        `its head links a stylesheet (${looks.stylesheets.join(', ')})`,
        looks.stylesheets.length > 0,
      );
      yield* Proof.assert(
        `the body is in the Web Platform's font (${looks.font})`,
        looks.font.includes('Inter Variable'),
      );
      yield* Proof.assert(
        `and on its background (${looks.background})`,
        looks.background !== '' && looks.background !== 'rgba(0, 0, 0, 0)',
      );
      yield* Proof.assert(
        `the app's own classes apply too: the header is ${looks.header}`,
        looks.header === 'sticky',
      );
    }),
});
