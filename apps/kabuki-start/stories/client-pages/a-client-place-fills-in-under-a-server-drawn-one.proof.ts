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

const open = (page: Page, path: string, place: string) =>
  page
    .goto(`${SITE}${path}`)
    .then(() => page.waitForSelector(`[data-testid="place:${place}"]`));

export default Proof.browser({
  title: 'A client place fills in after the page around it arrives',
  description:
    'The playground under the static docs, and the activity under the dynamic account: the server draws the place above, the browser loads and draws the client place, its lazy View and its Input.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Grace');
      const problems: string[] = [];
      yield* tab.raw('Sign in as Grace', (raw) => {
        const page = raw as Page;
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning')
            problems.push(`${message.type()}: ${message.text()}`);
        });
        page.on('pageerror', (error) => problems.push(error.message));
        return page
          .context()
          .addCookies([{ name: 'session', value: 'Grace', url: SITE }]);
      });
      return { tab, problems };
    }),
  act: ({ tab, problems }) =>
    Effect.gen(function* () {
      yield* tab.raw('Open /docs/playground', (raw) =>
        open(raw as Page, '/docs/playground', 'Docs.Playground'),
      );
      const playground = yield* tab.evaluate(badges);
      const routeRead = yield* tab.text(
        '[data-testid="place:Docs.Playground"] pre >> nth=0',
      );
      yield* tab.raw('Open /account/activity', (raw) =>
        open(raw as Page, '/account/activity', 'Account.Activity'),
      );
      const activity = yield* tab.evaluate(badges);
      const events = yield* tab.count(
        '[data-testid="place:Account.Activity"] li',
      );
      return {
        playground,
        routeRead,
        activity,
        events,
        problems: [...problems],
      };
    }),
  verify: ({ playground, routeRead, activity, events, problems }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the docs came drawn by the server (${playground['Docs']})`,
        playground['Docs'] === 'server/server',
      );
      yield* Proof.assert(
        `the playground was drawn by the browser (${playground['Docs.Playground']})`,
        playground['Docs.Playground'] === 'browser/none',
      );
      yield* Proof.assert(
        'and reads a URL as a Route',
        routeRead.includes('"_tag": "At"'),
      );
      yield* Proof.assert(
        `the account came drawn by the server for Grace (${activity['Account']})`,
        activity['Account'] === 'server/server',
      );
      yield* Proof.assert(
        `the activity was drawn by the browser from the Input it fetched (${activity['Account.Activity']})`,
        activity['Account.Activity'] === 'browser/browser',
      );
      yield* Proof.assert(`with its events listed (${events})`, events > 0);
      yield* Proof.assert(
        `hydrating an empty client outlet logs no error or warning${problems.length ? `: ${problems.join(' | ')}` : ''}`,
        problems.length === 0,
      );
    }),
});
