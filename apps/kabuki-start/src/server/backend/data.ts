/*
 * What the pretend backend holds, the same for everyone: posts, teams and
 * a feed, written here so the demo needs no database. There is a lot of it
 * on purpose: every list is long enough to scroll, so there is a position
 * to put back.
 */

/** Sentences the posts are written from: each post takes its own run of them. */
const SENTENCES = [
  'Page.define is Actor.define with a place in the URL, and Page.build is Actor.build.',
  'The page writes its own Model, States, Messages, Children and Workers, as any Actor does.',
  'The Router loads its data and hands it in as status.',
  'A page draws Loading, Failed and Ready itself, with a switch on its status.',
  'Every page on a URL loads its own data.',
  'Opened at a member, the team and the member start loading together.',
  'The browser asks for both in one request: the Data cache batches what is asked for in the same moment.',
  'Each answer comes back on its own line, as soon as its Loader is done.',
  'One copy per page and params is kept, newest first, up to fifty.',
  'Back, Forward and a plain link to a page seen before all show its copy at once.',
  'A static page is never loaded again: its data only changes with a deploy.',
  'A dynamic page shows its copy and loads it again behind it, refreshing.',
  'A move to pages whose data is not on screen is held for up to 150 ms.',
  'If the data comes within the delay, the move lands with every page Ready.',
  'Past the delay, the move lands anyway and each new page shows it is loading.',
  'A loading screen stays at least 300 ms, so it never flashes.',
  'Pages whose key did not change are kept, with their Model and their State.',
  'A static page is drawn once per deploy per data center, and kept in the edge Cache.',
  'A client page is sent loading: the browser loads its data once the Runtime starts.',
  'Each Scroll area is put back by its own page, once its data is drawn.',
  'A page a move keeps is never drawn again, so its scroll is never touched.',
  'Per entry, Back and Forward return each area to where it was on that entry.',
  'Per URL, any way back to a place finds it where it was left, a plain link too.',
  'Positions are saved to the tab’s session storage, so a reload starts from them.',
  'Nothing scrolls while the Timeline shows a past Step.',
  'A Loader that breaks fails its own page alone: the pages around it stay.',
  'A Redirect from a Loader replaces the entry, so Back never returns to it.',
  'Metadata is worked out from a page’s params and data, so a server writes it before it draws.',
] as const;

const TOPICS = [
  [
    'pages-are-actors',
    'A page is an Actor',
    'Its own Model, States and Messages, with its data as Props.',
  ],
  [
    'no-waterfall',
    'No waterfall',
    'A page and the page under it load side by side.',
  ],
  [
    'back-is-free',
    'Back is free',
    'The Data cache keeps the last data of every page.',
  ],
  [
    'held-moves',
    'A move, held',
    'Up to 150 ms on the page shown, then the new one draws its loading.',
  ],
  [
    'never-flash',
    'Never a flash',
    'A loading screen that shows stays long enough to read.',
  ],
  [
    'kept-pages',
    'Kept pages',
    'A move keeps every page whose key did not change.',
  ],
  ['static-pages', 'Static pages', 'Drawn once per deploy, kept at the edge.'],
  [
    'dynamic-pages',
    'Dynamic pages',
    'Drawn for each request, with the request in hand.',
  ],
  ['client-pages', 'Client pages', 'Sent loading; the browser loads the rest.'],
  [
    'one-request',
    'One request',
    'Every place asked for at once, answered as each is done.',
  ],
  [
    'scroll-entry',
    'Scroll per entry',
    'Back finds each area where that entry left it.',
  ],
  [
    'scroll-url',
    'Scroll per URL',
    'Any way back to a list finds it as it was.',
  ],
  [
    'scroll-off',
    'Scroll left alone',
    'A page that says false is never touched.',
  ],
  [
    'reload-keeps',
    'A reload keeps the page',
    'New data behind the old, the draft kept.',
  ],
  [
    'preloads',
    'Preloads',
    'Hover, in view, or never: the next page warmed in time.',
  ],
  ['lazy-views', 'Lazy Views', 'A page’s code loaded beside its data.'],
  ['redirects', 'Redirects', 'A Loader’s 302 and the Routes’ 308.'],
  ['not-found', 'Not found', 'A Loader’s 404, drawn inside the page above.'],
  [
    'metadata',
    'Metadata',
    'The title and tags, worked out before the page is drawn.',
  ],
  [
    'time-travel',
    'Time Travel',
    'A past Step is a drawing: nothing fetches, nothing scrolls.',
  ],
  ['the-timeline', 'The Timeline', 'One Message per move, every Preload too.'],
  [
    'session-keys',
    'Keys that last',
    'An entry’s key survives a reload, and never repeats.',
  ],
  [
    'the-edge',
    'At the edge',
    'A Worker draws the page; the Cache keeps the static ones.',
  ],
  [
    'hydration',
    'Hydration',
    'The browser carries on from the Snapshot the server drew.',
  ],
] as const;

/** `count` sentences, starting at `from`, going round the list. */
const sentences = (from: number, count: number) =>
  Array.from(
    { length: count },
    (_, at) => SENTENCES[(from + at * 7) % SENTENCES.length]!,
  );

export const POSTS = TOPICS.map(([slug, title, summary], at) => ({
  slug,
  title,
  summary,
  date: `2026-${String(9 + Math.floor(at / 12)).padStart(2, '0')}-${String((at % 12) * 2 + 1).padStart(2, '0')}`,
  // Eight paragraphs of three sentences: long enough to read halfway down.
  body: Array.from({ length: 8 }, (_, paragraph) =>
    sentences(at * 3 + paragraph * 5, 3).join(' '),
  ),
}));

const NAMES = [
  'Ada',
  'Lin',
  'Sam',
  'Kai',
  'Noor',
  'Ravi',
  'Mei',
  'Theo',
  'Ines',
  'Omar',
  'Yuki',
  'Bea',
  'Juno',
  'Elif',
  'Tariq',
  'Wren',
  'Iris',
  'Pavel',
  'Zara',
  'Leo',
  'Nia',
  'Hugo',
  'Sana',
  'Odin',
] as const;
const ROLES = [
  'Runtime',
  'Routing',
  'Start',
  'Design',
  'Devtools',
  'Docs',
] as const;
const DONE = [
  'reviewed a change to the Router',
  'wrote a test for a held move',
  'shipped a fix to the Data cache',
  'paired on a Loader',
  'drew a new loading screen',
  'measured a cold start at the edge',
  'answered a question about pages',
  'tidied the Timeline',
] as const;

const member = (team: number, at: number) => {
  const name = NAMES[(at + team * 5) % NAMES.length]!;
  return {
    handle: name.toLowerCase(),
    name,
    role: ROLES[(at + team) % ROLES.length]!,
    bio: sentences(at + team * 4, 2).join(' '),
    // Twenty-four things, newest first: enough to scroll the pane.
    activity: Array.from(
      { length: 24 },
      (_, day) => `Day ${24 - day}: ${DONE[(at + day) % DONE.length]}`,
    ),
  };
};

export const TEAMS = [
  { slug: 'core', name: 'Core' },
  { slug: 'web', name: 'Web' },
].map((team, at) => ({
  ...team,
  members: Array.from({ length: 18 }, (_, each) => member(at, each)),
}));

/** Sixty items, each a post: open one, then Back, and the window is where it was. */
export const FEED = Array.from({ length: 60 }, (_, id) => {
  const post = POSTS[id % POSTS.length]!;
  return {
    id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    minutes: 2 + ((id * 3) % 7),
  };
});
