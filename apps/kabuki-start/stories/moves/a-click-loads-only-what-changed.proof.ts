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
  url(): string;
  title(): Promise<string>;
  on(
    event: 'request',
    listener: (request: {
      method(): string;
      url(): string;
      postData(): string | null;
    }) => void,
  ): void;
}

/** Each badge on screen, by place: who drew it, and where its Input came from. */
const badges = () =>
  Object.fromEntries(
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid=provenance]'),
      (each) => [
        each.dataset.place,
        `${each.dataset.drawn}/${each.dataset.input}`,
      ],
    ),
  ) as Record<string, string>;

export default Proof.browser({
  title: 'A click loads only the places that changed, in one request',
  description:
    'From the blog drawn by the server, opening a post asks /_kabuki/load once, for the post alone: the list is kept, and the post is drawn by the browser from the Input it fetched.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const loads: string[][] = [];
      yield* tab.raw('Open /blog', async (raw) => {
        const page = raw as Page;
        page.on('request', (request) => {
          if (
            request.method() === 'POST' &&
            request.url().endsWith('/_kabuki/load')
          )
            loads.push(
              (
                JSON.parse(request.postData() ?? '{}') as {
                  places: { name: string }[];
                }
              ).places.map((place) => place.name),
            );
        });
        await page.goto(`${SITE}/blog`);
        await page.waitForSelector('[data-testid=runtime][data-live=true]');
      });
      return { tab, loads, first: yield* tab.evaluate(badges) };
    }),
  act: ({ tab, loads }) =>
    Effect.gen(function* () {
      const onFirstPage = loads.length;
      yield* tab.click(
        'Open the post "Back is free"',
        'main a[href="/blog/back-is-free"]',
      );
      yield* tab.waitFor(
        'The post is drawn',
        '[data-testid="place:Blog.Post"]',
      );
      yield* Effect.sleep('300 millis');
      yield* tab.screenshot('The post, drawn by the browser');
      const where = yield* tab.raw(
        'Read the address',
        async (raw) => new URL((raw as Page).url()).pathname,
      );
      return {
        onFirstPage,
        loads: [...loads],
        after: yield* tab.evaluate(badges),
        where,
      };
    }),
  verify: ({ onFirstPage, loads, after, where }, { first }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the blog came drawn by the server with its Input (${first['Blog']})`,
        first['Blog'] === 'server/server',
      );
      yield* Proof.assert(
        'the first page asked /_kabuki/load nothing',
        onFirstPage === 0,
      );
      yield* Proof.assert(
        `the click sent exactly one POST /_kabuki/load (${loads.length})`,
        loads.length === 1,
      );
      yield* Proof.assert(
        `and it asked for the post alone (${JSON.stringify(loads[0])})`,
        JSON.stringify(loads[0]) === '["Blog.Post"]',
      );
      yield* Proof.assert(
        `the post says drawn by the browser, Input fetched (${after['Blog.Post']})`,
        after['Blog.Post'] === 'browser/browser',
      );
      yield* Proof.assert(
        `the list kept the Input that came with the page (${after['Blog']})`,
        after['Blog'] === 'server/server',
      );
      yield* Proof.assert(
        `the address is the post's (${where})`,
        where === '/blog/back-is-free',
      );
    }),
});
