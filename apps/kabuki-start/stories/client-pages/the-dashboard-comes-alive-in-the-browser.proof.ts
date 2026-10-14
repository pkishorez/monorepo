import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

interface Request {
  method(): string;
  url(): string;
}

/** The few Playwright calls this Proof makes through `tab.raw`. */
interface Page {
  goto(url: string): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  on(
    event: 'request' | 'requestfinished',
    listener: (request: Request) => void,
  ): void;
  on(
    event: 'console',
    listener: (message: { type(): string; text(): string }) => void,
  ): void;
}

/** When a request was sent and when its answer had fully arrived, in ms since the page was opened. */
interface Span {
  readonly url: string;
  start: number;
  end: number | null;
}

/** The dashboard's badge, its clock and the Runtime's footer. */
const reading = () => {
  const badge = document.querySelector<HTMLElement>(
    '[data-testid=provenance][data-place=Dashboard]',
  );
  return {
    badge: badge ? `${badge.dataset.drawn}/${badge.dataset.input}` : null,
    clock: document.querySelector('[data-testid=clock]')?.textContent ?? null,
    runtime:
      document.querySelector('[data-testid=runtime]')?.textContent ?? null,
  };
};

export default Proof.browser({
  title: 'The dashboard is loaded and drawn in the browser, then keeps ticking',
  description:
    'A client place with a lazy View: the browser asks for its stats and the code of its View at the same time, draws it, and its clock ticks once a second, which only a started Runtime does.',
  page: () => {},
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop', 'Reader');
      const spans: Span[] = [];
      const problems: string[] = [];
      const opened = Date.now();
      yield* tab.raw('Open /dashboard', async (raw) => {
        const page = raw as Page;
        page.on('console', (message) => {
          if (message.type() === 'error' || message.type() === 'warning')
            problems.push(`${message.type()}: ${message.text()}`);
        });
        page.on('request', (request) => {
          if (/dashboard\.view|\/_kabuki\/load/.test(request.url()))
            spans.push({
              url: request.url(),
              start: Date.now() - opened,
              end: null,
            });
        });
        page.on('requestfinished', (request) => {
          const span = spans.find(
            (each) => each.url === request.url() && each.end === null,
          );
          if (span) span.end = Date.now() - opened;
        });
        await page.goto(`${SITE}/dashboard`);
        await page.waitForSelector('[data-testid="place:Dashboard"]');
      });
      return { tab, spans, problems };
    }),
  act: ({ tab, spans, problems }) =>
    Effect.gen(function* () {
      const first = yield* tab.evaluate(reading);
      yield* Effect.sleep('2200 millis');
      const later = yield* tab.evaluate(reading);
      yield* tab.screenshot('The dashboard, live');
      return {
        first,
        later,
        spans: spans.map((span) => ({ ...span })),
        problems: [...problems],
      };
    }),
  verify: ({ first, later, spans, problems }) =>
    Effect.gen(function* () {
      const load = spans.find((span) => span.url.endsWith('/_kabuki/load'));
      const chunk = spans.find((span) => /dashboard\.view/.test(span.url));
      yield* Proof.assert(
        `the dashboard says drawn by the browser, Input fetched (${first.badge})`,
        first.badge === 'browser/browser',
      );
      const loads = spans.filter((span) =>
        span.url.endsWith('/_kabuki/load'),
      ).length;
      yield* Proof.assert(
        `the stats came from one POST /_kabuki/load (${loads})`,
        loads === 1,
      );
      yield* Proof.assert(
        `its View's chunk was loaded (${chunk?.url.replace(SITE, '')})`,
        chunk !== undefined,
      );
      yield* Proof.assert(
        `and the two were in flight together (load ${load?.start}–${load?.end}ms, chunk ${chunk?.start}–${chunk?.end}ms)`,
        load !== undefined &&
          chunk !== undefined &&
          chunk.start <= (load.end ?? Infinity) &&
          load.start <= (chunk.end ?? Infinity),
      );
      yield* Proof.assert(
        `the clock ticks (${first.clock} → ${later.clock})`,
        first.clock !== null &&
          later.clock !== null &&
          first.clock !== later.clock,
      );
      yield* Proof.assert(
        `the Runtime is live (${later.runtime})`,
        later.runtime?.startsWith('Runtime live') ?? false,
      );
      yield* Proof.assert(
        `and the console stays clean${problems.length ? `: ${problems.join(' | ')}` : ''}`,
        problems.length === 0,
      );
    }),
});
