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
  title:
    'A report and its dashboard are loaded in one request, both in the browser',
  description:
    'A client place with params under a client place: the browser asks /_kabuki/load once for both, with the report named by its id, and draws them.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const asked: Array<ReadonlyArray<{ name: string; params: unknown }>> = [];
      yield* tab.raw('Open /dashboard/reports/traffic', async (raw) => {
        const page = raw as Page;
        page.on('request', (request) => {
          if (
            request.method() === 'POST' &&
            request.url().endsWith('/_kabuki/load')
          )
            asked.push(
              (JSON.parse(request.postData() ?? '{}') as { places: [] }).places,
            );
        });
        await page.goto(`${SITE}/dashboard/reports/traffic`);
        await page.waitForSelector('[data-testid="place:Dashboard.Report"]');
      });
      return { tab, asked };
    }),
  act: ({ tab, asked }) =>
    Effect.gen(function* () {
      const title = yield* tab.text(
        '[data-testid="place:Dashboard.Report"] h1',
      );
      const rows = yield* tab.count(
        '[data-testid="place:Dashboard.Report"] tr',
      );
      const pageTitle = yield* tab.evaluate(() => document.title);
      return {
        title,
        rows,
        pageTitle,
        badges: yield* tab.evaluate(badges),
        asked: [...asked],
      };
    }),
  verify: ({ title, rows, pageTitle, badges, asked }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `one POST /_kabuki/load (${asked.length})`,
        asked.length === 1,
      );
      yield* Proof.assert(
        `for the dashboard and the traffic report (${JSON.stringify(asked[0])})`,
        JSON.stringify(asked[0]) ===
          JSON.stringify([
            { name: 'Dashboard', params: {} },
            { name: 'Dashboard.Report', params: { id: 'traffic' } },
          ]),
      );
      yield* Proof.assert(
        `the report is drawn: ${title}, ${rows} rows`,
        title === 'Traffic by page' && rows === 4,
      );
      yield* Proof.assert(
        `both say drawn by the browser, Input fetched (${badges['Dashboard']}, ${badges['Dashboard.Report']})`,
        badges['Dashboard'] === 'browser/browser' &&
          badges['Dashboard.Report'] === 'browser/browser',
      );
      yield* Proof.assert(
        `the tab's title is now the report's (${pageTitle})`,
        pageTitle === 'Traffic by page · Kabuki Start',
      );
    }),
});
