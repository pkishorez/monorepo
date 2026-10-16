import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Pages, router } from '../../../shared/index.ts';
import type { Route } from '../../../shared/index.ts';
import { PlaceFrame, link } from '../../components/index.ts';

/*
 * The landing page: static, with no data. Every case Kabuki Start handles,
 * one URL each. The box around each page says what happened.
 */

type Stop = {
  readonly url: string;
  readonly what: string;
  /** The Route a link goes to; none for a URL the server answers itself. */
  readonly to?: Route;
  readonly hash?: string;
};

const GROUPS: ReadonlyArray<{
  readonly title: string;
  readonly stops: ReadonlyArray<Stop>;
}> = [
  {
    title: 'Render Modes',
    stops: [
      {
        url: '/blog/pages-are-actors',
        to: router.Blog.Post({ slug: 'pages-are-actors' }),
        what: 'Static, nested: open another post and only the post loads.',
      },
      {
        url: '/teams/core/ada',
        to: router.Teams.Member({ team: 'core', member: 'ada' }),
        what: 'Dynamic: a team and its member load side by side.',
      },
      {
        url: '/feed',
        to: router.Feed(),
        what: 'Client: sent loading, loaded in the browser.',
      },
    ],
  },
  {
    title: 'Scroll',
    stops: [
      {
        url: '/blog/pages-are-actors',
        to: router.Blog.Post({ slug: 'pages-are-actors' }),
        what: 'Scroll both panes, open another post, press Back: each comes back.',
      },
      {
        url: '/feed',
        to: router.Feed(),
        what: 'Scroll the window, open a post, press Back: the window comes back.',
      },
      {
        url: '/blog/scroll-entry#part-5',
        to: router.Blog.Post({ slug: 'scroll-entry' }),
        hash: 'part-5',
        what: 'A link to part of a page: scrolled into view once its data comes.',
      },
    ],
  },
  {
    title: 'Loading',
    stops: [
      {
        url: '/preload',
        to: router.Preload(),
        what: 'Links that preload, and a Stale time of 30 s.',
      },
      {
        url: '/search?q=scroll',
        to: router.Search({ q: 'scroll' }),
        what: 'A query its Loader reads. Reload keeps what you typed.',
      },
    ],
  },
  {
    title: 'When it goes wrong',
    stops: [
      {
        url: '/blog/broken',
        to: router.Blog.Post({ slug: 'broken' }),
        what: 'A Loader that breaks, inside its own card, with Try again.',
      },
      {
        url: '/blog/missing',
        to: router.Blog.Post({ slug: 'missing' }),
        what: 'A Loader that finds nothing: a 404.',
      },
      {
        url: '/nowhere',
        to: router.read('/nowhere').route,
        what: 'A URL with no page: a 404.',
      },
      {
        url: '/blog/moved',
        to: router.Blog.Post({ slug: 'moved' }),
        what: 'A Loader that Redirects: a 302.',
      },
      {
        url: '/posts/no-waterfall',
        what: 'An old address the router redirects: a 308.',
      },
    ],
  },
];

export const HomeView = View.make(Pages.HomeLive, () => (
  <PlaceFrame
    place="Home"
    title="Kabuki Start"
    intro="Every page is an Actor, drawn in a card that says how it got here. Loaders are slow on purpose."
  >
    <div className="space-y-8">
      {GROUPS.map(({ title, stops }) => (
        <section key={title} className="space-y-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </h2>
          <ul className="divide-y divide-border text-sm">
            {stops.map(({ url, what, to, hash }) => (
              <li
                key={url + what}
                className="grid gap-1 py-2.5 sm:grid-cols-[15rem_1fr]"
              >
                {to ? (
                  <Router.Link
                    to={to}
                    {...(hash ? { hash } : {})}
                    className={`${link} font-mono`}
                  >
                    {url}
                  </Router.Link>
                ) : (
                  <a href={url} className={`${link} font-mono`}>
                    {url}
                  </a>
                )}
                <span className="text-muted-foreground">{what}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  </PlaceFrame>
));
