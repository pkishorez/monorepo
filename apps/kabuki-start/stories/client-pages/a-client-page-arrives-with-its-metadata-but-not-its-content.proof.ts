import { Effect } from 'effect';
import { Proof } from 'laymos/story';

/** The site under test: `KABUKI_START_URL`, or `vp dev` on its local port. */
const SITE =
  globalThis.process?.env.KABUKI_START_URL?.replace(/\/$/, '') ??
  'http://localhost:4317';

/** One page as the server sends it, before any script runs. */
const get = (path: string, cookie?: string) =>
  Effect.promise(async () => {
    const response = await fetch(`${SITE}${path}`, {
      redirect: 'manual',
      headers: cookie ? { cookie } : {},
    });
    const html = await response.text();
    return {
      path,
      status: response.status,
      title: /<title>([^<]*)<\/title>/.exec(html)?.[1],
      html,
    };
  });

export default Proof.make({
  title:
    'A client page arrives with its title and description, and the browser draws the rest',
  description:
    'The server draws the places above a client place and leaves its outlet empty: its content and its Input are not in the HTML, but the Metadata it can give without its Input is.',
  prepare: Effect.succeed({}),
  act: () =>
    Effect.all([
      get('/dashboard'),
      get('/dashboard/reports/traffic'),
      get('/docs/playground'),
      get('/account/activity', 'session=Grace'),
    ]),
  verify: ([dashboard, report, playground, activity]) =>
    Effect.gen(function* () {
      for (const page of [dashboard, report, playground, activity])
        yield* Proof.assert(
          `${page.path} answers 200 (${page.status})`,
          page.status === 200,
        );

      yield* Proof.assert(
        `/dashboard has its title (${dashboard.title}) and noindex`,
        dashboard.title === 'Dashboard · Kabuki Start' &&
          dashboard.html.includes('<meta name="robots" content="noindex"'),
      );
      yield* Proof.assert(
        'but none of its stats or chart',
        !dashboard.html.includes('data-testid="place:Dashboard"') &&
          !dashboard.html.includes('Visits, 14 days'),
      );
      yield* Proof.assert(
        `a report has the dashboard's title until its Input says its own (${report.title})`,
        report.title === 'Dashboard · Kabuki Start',
      );
      yield* Proof.assert(
        'and no report in it',
        !report.html.includes('Traffic by page') &&
          !report.html.includes('data-testid="place:Dashboard.Report"'),
      );

      yield* Proof.assert(
        `/docs/playground has its own title (${playground.title}) and canonical`,
        playground.title === 'Playground · Kabuki Start' &&
          playground.html.includes(
            '<link rel="canonical" href="https://start.kishore.app/docs/playground"',
          ),
      );
      yield* Proof.assert(
        'the docs around it are drawn by the server, the playground is not',
        playground.html.includes(
          'data-place="Docs" data-mode="static" data-drawn="server"',
        ) && !playground.html.includes('data-testid="place:Docs.Playground"'),
      );

      yield* Proof.assert(
        `/account/activity has its title (${activity.title})`,
        activity.title === 'Activity · Kabuki Start',
      );
      yield* Proof.assert(
        'the account around it is drawn for Grace, the activity is not',
        activity.html.includes('data-testid="viewer">Grace<') &&
          !activity.html.includes('data-testid="place:Account.Activity"'),
      );
    }),
});
