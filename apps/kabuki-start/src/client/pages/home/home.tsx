import type { RenderMode } from '@kestack/kabuki/routing';
import { Route, Router } from '@kestack/kabuki/routing';
import { Pages, Routes } from '../../../shared/index.ts';
import type { Route as AnyRoute } from '../../../shared/index.ts';
import { MODE, PlaceFrame, chip, modeOf } from '../../components/index.ts';

/*
 * The landing page: static, with no data. How to read a box, then a tour
 * of every case, one stop per URL, each marked with the color of the page
 * it goes to.
 */

type Stop = {
  readonly to: AnyRoute;
  readonly url: string;
  readonly what: string;
  /** The element on the page it goes to. */
  readonly hash?: string;
};

const TOUR: ReadonlyArray<{
  readonly title: string;
  readonly stops: ReadonlyArray<Stop>;
}> = [
  {
    title: 'Nested pages and their scroll',
    stops: [
      {
        to: Routes.Blog.Post({ slug: 'pages-are-actors' }),
        url: '/blog/pages-are-actors',
        what: 'two panes, two Places: scroll both, open another post, press Back. The post comes back where you read to; the list never moved.',
      },
      {
        to: Routes.Teams.Member({ team: 'core', member: 'ada' }),
        url: '/teams/core/ada',
        what: 'a team and its member load side by side, the member first. Leave and come back by a link: the member list is where it was.',
      },
    ],
  },
  {
    title: 'The window',
    stops: [
      {
        to: Routes.Feed(),
        url: '/feed',
        what: 'a client page: sent loading, loaded in the browser. Scroll far, open a post, press Back: the window waits for the feed, then goes back.',
      },
      {
        to: Routes.Blog.Post({ slug: 'scroll-entry' }),
        url: '/blog/scroll-entry#part-5',
        what: 'a link to a part of a post: the move lands, its data comes, then part 5 is scrolled into view.',
        hash: 'part-5',
      },
    ],
  },
  {
    title: 'Loading and the Data cache',
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
        to: Routes.Search({ q: 'scroll' }),
        url: '/search?q=scroll',
        what: 'a query its Loader reads: a new one loads again on the same page, each with its own scroll',
      },
    ],
  },
  {
    title: 'When it goes wrong',
    stops: [
      {
        to: Routes.Blog.Post({ slug: 'broken' }),
        url: '/blog/broken',
        what: 'a Loader that breaks: the post says so and retries, the blog around it stays',
      },
      {
        to: Routes.Flaky(),
        url: '/flaky',
        what: 'a client page that fails half the time',
      },
      {
        to: Routes.Blog.Post({ slug: 'missing' }),
        url: '/blog/missing',
        what: 'a Loader that finds nothing: a 404, drawn inside the blog',
      },
      {
        to: Routes.Blog.Post({ slug: 'moved' }),
        url: '/blog/moved',
        what: "a Loader's Redirect: a 302 from the server, a move in the browser",
      },
      {
        to: Routes.read('/nowhere').route,
        url: '/nowhere',
        what: 'a URL that names no page: the root page draws it, a 404',
      },
    ],
  },
];

const RENDER: ReadonlyArray<RenderMode> = ['static', 'dynamic', 'client'];
/** What the Router does with scroll, as TanStack Router does it: nothing on a page says it. */
const SCROLL: ReadonlyArray<readonly [string, string]> = [
  ['a new entry', 'the window goes to the top, or to the #hash'],
  [
    'Back, Forward, a reload',
    'the window and every list go back where they were',
  ],
  ['what stays on the page', 'keeps where it was, as the blog’s list does'],
  [
    'data-scroll-restoration-id',
    'names a pane, so a new post’s is never taken for the last one’s',
  ],
  ['resetScroll: false', 'a link that leaves every scroll as it is'],
];

export const HomeView = Route.view(Pages.Home, () => (
  <div className="space-y-8 sm:space-y-12">
    <div className="max-w-3xl space-y-4 pt-2">
      <p className="font-mono text-xs text-muted-foreground">
        @kestack/kabuki/start
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        Every page is an Actor, in a box that says how it got here.
      </h1>
      <p className="max-w-prose text-pretty text-muted-foreground sm:text-lg">
        Each page sits in a box with the color of its Render Mode. Nested pages
        are nested boxes, each loading on its own. Every scroll is kept per
        history entry. Every Loader is slow on purpose. Move around, then press
        Back.
      </p>
    </div>

    <PlaceFrame place="Home" title="How to read a box">
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Render Mode: its color</h2>
          <ul className="space-y-2.5">
            {RENDER.map((mode) => (
              <li key={mode} className="flex items-start gap-3 text-sm">
                <span className={`${chip} mt-0.5 shrink-0`}>
                  <span
                    aria-hidden
                    className={`size-1.5 rounded-full ${MODE[mode].dot}`}
                  />
                  <span className={MODE[mode].text}>{mode}</span>
                </span>
                <span className="text-muted-foreground">{MODE[mode].what}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Scroll: kept per entry, as TanStack Start does
          </h2>
          <ul className="space-y-2.5">
            {SCROLL.map(([when, what]) => (
              <li key={when} className="flex items-start gap-3 text-sm">
                <span className={`${chip} mt-0.5 shrink-0`}>{when}</span>
                <span className="text-muted-foreground">{what}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="text-sm text-muted-foreground">
        Its header also says where its data is, who drew it, and whether its
        data came with the page or was loaded in the browser.
      </p>
    </PlaceFrame>

    {TOUR.map(({ title, stops }) => (
      <section key={title} className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {stops.map(({ to, url, what, hash }) => {
            const page = Routes.places(to).at(-1);
            const render = page ? modeOf(page.name) : 'static';
            return (
              <li key={url}>
                <Router.Link
                  to={to}
                  {...(hash ? { hash } : {})}
                  className={`group flex h-full flex-col gap-2 rounded-xl border border-l-[3px] border-border bg-card/60 p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${MODE[render].edge}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm font-medium">{url}</span>
                    <span
                      aria-hidden
                      className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    >
                      →
                    </span>
                  </span>
                  <span className="text-sm text-pretty text-muted-foreground">
                    {what}
                  </span>
                </Router.Link>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
));
