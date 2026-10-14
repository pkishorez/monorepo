import { Route, Router } from '@kestack/kabuki/routing';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kestack/web-platform/components/card';
import { Pages, Routes } from '../../../shared/index.ts';
import type { Route as AnyRoute } from '../../../shared/index.ts';
import { PageFrame, tile } from '../../components/index.ts';

/*
 * The landing page: static, with no data, and a tour of every case, one
 * card per URL, grouped by what it shows.
 */

type Stop = {
  readonly to: AnyRoute;
  readonly url: string;
  readonly what: string;
};

const TOUR: ReadonlyArray<{
  readonly title: string;
  readonly stops: ReadonlyArray<Stop>;
}> = [
  {
    title: 'Loading',
    stops: [
      {
        to: Routes.Blog.Post({ slug: 'pages-are-actors' }),
        url: '/blog/pages-are-actors',
        what: 'a post takes a second: past 150 ms the move lands and the post draws its own loading screen, inside the blog',
      },
      {
        to: Routes.Blog(),
        url: '/blog',
        what: 'a quick page: the move waits for its data, and no loading screen shows',
      },
    ],
  },
  {
    title: 'Nested and parallel',
    stops: [
      {
        to: Routes.Teams.Member({ team: 'core', member: 'ada' }),
        url: '/teams/core/ada',
        what: 'a team and a member load side by side: the member, quicker, shows first',
      },
      {
        to: Routes.Teams({ team: 'web' }),
        url: '/teams/web',
        what: 'a page with pages is a page on its own when the URL ends at it',
      },
    ],
  },
  {
    title: 'Failures',
    stops: [
      {
        to: Routes.Blog.Post({ slug: 'broken' }),
        url: '/blog/broken',
        what: 'a Loader that breaks: the post says so and retries, the blog around it stays',
      },
      {
        to: Routes.Flaky(),
        url: '/flaky',
        what: 'a client page that fails half the time: the server sends it loading',
      },
      {
        to: Routes.Blog.Post({ slug: 'missing' }),
        url: '/blog/missing',
        what: 'a Loader that finds nothing: a 404, drawn inside the blog',
      },
      {
        to: Routes.read('/nowhere').route,
        url: '/nowhere',
        what: 'a URL that names no page: the root page draws it, a 404',
      },
    ],
  },
  {
    title: 'Redirects',
    stops: [
      {
        to: Routes.Blog.Post({ slug: 'moved' }),
        url: '/blog/moved',
        what: "a Loader's Redirect: a 302 from the server, a move in the browser",
      },
      {
        to: Routes.read('/posts/no-waterfall').route,
        url: '/posts/no-waterfall',
        what: 'an old address the Routes replace: a 308',
      },
    ],
  },
  {
    title: 'The Data cache',
    stops: [
      {
        to: Routes.Preload(),
        url: '/preload',
        what: 'links that load the next page on hover, once in view, or never',
      },
      {
        to: Routes.Notes(),
        url: '/notes',
        what: 'a reload loads the data again behind it; the page and its draft stay',
      },
      {
        to: Routes.Search({ q: 'back' }),
        url: '/search?q=back',
        what: 'a query its Loader reads: a new one loads again on the same page',
      },
    ],
  },
];

export const HomeView = Route.view(Pages.Home, () => (
  <PageFrame
    place="Home"
    title="Pages as Actors"
    intro="Each page is an Actor with a place in the URL; Kabuki writes one more around it that loads its data, and hands it in as Loading, Failed or Ready. Every Loader here is slow on purpose. Go somewhere, then press Back: the Data cache shows it at once."
  >
    {TOUR.map(({ title, stops }) => (
      <section key={title} className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {stops.map(({ to, url, what }) => (
            <li key={url}>
              <Router.Link to={to} className={tile}>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="font-mono">{url}</CardTitle>
                    <CardDescription>{what}</CardDescription>
                  </CardHeader>
                </Card>
              </Router.Link>
            </li>
          ))}
        </ul>
      </section>
    ))}
  </PageFrame>
));
