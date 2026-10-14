/*
 * What the pretend backend holds: a few posts and teams, the same for
 * everyone, written here so the demo needs no database.
 */

export const POSTS = [
  {
    slug: 'pages-are-actors',
    title: 'A page is an Actor',
    summary: 'Its own Model, States and Messages, with its data as Props.',
    date: '2026-10-01',
    body: [
      'Route.page is Actor.make with a place in the URL. The page writes its own Model, States, Messages, Children and Workers, as any Actor does.',
      'Kabuki writes one more Actor around it, the Place, which loads its data and hands it in as `status`: Loading, Failed or Ready. The page draws all three from Props.',
    ],
  },
  {
    slug: 'no-waterfall',
    title: 'No waterfall',
    summary: 'A page and the page under it load side by side.',
    date: '2026-10-08',
    body: [
      'Every page on a URL has its own Place, and every Place loads its own data. Opened at /teams/core/ada, the team and the member start loading together.',
      'The browser asks for both in one request to /_kabuki/load: the Data cache batches what is asked for in the same moment.',
    ],
  },
  {
    slug: 'back-is-free',
    title: 'Back is free',
    summary: 'The Data cache keeps the last data of every page.',
    date: '2026-10-12',
    body: [
      'One copy per page and params, newest first. Back, Forward and a plain link to a page seen before all show its copy at once.',
      'A static page is never loaded again: its data only changes with a deploy. A dynamic page shows its copy and loads it again behind it.',
    ],
  },
] as const;

export const TEAMS = [
  {
    slug: 'core',
    name: 'Core',
    members: [
      {
        handle: 'ada',
        name: 'Ada',
        role: 'Runtime',
        bio: 'Keeps the Snapshot honest.',
      },
      {
        handle: 'lin',
        name: 'Lin',
        role: 'Routing',
        bio: 'Wrote the first Place.',
      },
    ],
  },
  {
    slug: 'web',
    name: 'Web',
    members: [
      {
        handle: 'sam',
        name: 'Sam',
        role: 'Start',
        bio: 'Draws pages at the edge.',
      },
      { handle: 'kai', name: 'Kai', role: 'Design', bio: 'Picks the greys.' },
    ],
  },
] as const;
