/*
 * kabuki's table of contents: every docs page, in the order the sidebar
 * shows it, grouped into sections. A page's slug is its URL under /kabuki,
 * and unique across sections, so a page can move between sections without
 * its URL changing. A written page's words are its MDX file, which the
 * client's `docs` registers by slug. A page marked `soon` is in the sidebar
 * but not written yet: its `outline` is the headings it will have.
 */

export type Doc = {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
} & (
  | { readonly soon?: undefined }
  | { readonly soon: true; readonly outline: ReadonlyArray<string> }
);

export type Section = {
  readonly title: string;
  /** Numbered in the sidebar, as chapters to read in order. */
  readonly series?: true;
  readonly docs: ReadonlyArray<Doc>;
};

export const SECTIONS = [
  {
    title: 'Get started',
    docs: [
      {
        slug: 'introduction',
        title: 'Introduction',
        summary: 'What kabuki is, and the problem it removes.',
      },
      {
        slug: 'quick-start',
        title: 'Quick start',
        summary: 'A running kabuki app in five minutes.',
      },
      {
        slug: 'installation',
        title: 'Installation',
        summary: 'The package, its peers, and what each is for.',
        outline: ['The package', 'Peers', 'TypeScript'],
        soon: true,
      },
      {
        slug: 'mental-model',
        title: 'kabuki in one picture',
        summary: 'Actors, Messages, one Snapshot, and React only drawing it.',
        outline: [
          'The tree',
          'One Mailbox',
          'The Snapshot',
          'Effect at the edges',
        ],
        soon: true,
      },
    ],
  },
  {
    title: 'Tutorial: build a file-sync app',
    series: true,
    docs: [
      {
        slug: 'first-actor',
        title: 'Your first Actor',
        summary:
          'Define an Actor, send it Messages, and watch its Model change.',
        outline: ['Define', 'Build', 'Send a Message', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'states',
        title: 'States that decide',
        summary: 'A sign-in gate, where leaving a State stops its work.',
        outline: ['A State Schema', 'Moving between States', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'children',
        title: 'Children',
        summary: 'Always, while a test holds, or one per key.',
        outline: ['always', 'while', 'each', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'doing-work',
        title: 'Doing work',
        summary: 'Commands and Workers, and a Worker per upload.',
        outline: ['Commands', 'Workers', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'capabilities-tutorial',
        title: 'Capabilities',
        summary: 'What an Actor Requires, and who Provides it.',
        outline: ['Requires', 'Provides', 'The Layer', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'drawing-it',
        title: 'Drawing it',
        summary: 'Views, reading Children, and lazy code.',
        outline: ['View.make', 'useChild', 'toReact', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'time-travel',
        title: 'Time travel',
        summary: 'Scrub the History, branch, and replay.',
        outline: ['The History', 'Replay', 'Devtools', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'pages-tutorial',
        title: 'Pages',
        summary: 'Give the app URLs: pages, Links and Loaders.',
        outline: ['Page.define', 'The router', 'Loaders', 'Checkpoint'],
        soon: true,
      },
      {
        slug: 'ship-it',
        title: 'Ship it',
        summary: 'Serve it with Start on Cloudflare.',
        outline: ['Start', 'The three tiers', 'Deploy', 'Checkpoint'],
        soon: true,
      },
    ],
  },
  {
    title: 'Concepts',
    docs: [
      {
        slug: 'actors',
        title: 'Actors',
        summary: 'A state machine and an actor at once.',
        outline: ['Define and build', 'Model and State', 'Instances'],
        soon: true,
      },
      {
        slug: 'messages',
        title: 'Messages and Updates',
        summary: 'The only way anything changes.',
        outline: ['A Message', 'An Update', 'Handled before send returns'],
        soon: true,
      },
      {
        slug: 'children-concept',
        title: 'Children and Props',
        summary: 'A parent controls its Children only through data.',
        outline: ['Invoking', 'Props', 'Keyed Children'],
        soon: true,
      },
      {
        slug: 'workers-and-commands',
        title: 'Workers and Commands',
        summary: 'Work that follows the Snapshot, and work made once.',
        outline: ['Workers', 'Commands', 'Scopes'],
        soon: true,
      },
      {
        slug: 'capabilities',
        title: 'Capabilities',
        summary: 'Needs bubble up until an ancestor Provides them.',
        outline: ['Requires', 'Provides', 'The app Layer'],
        soon: true,
      },
      {
        slug: 'snapshot',
        title: 'The Snapshot',
        summary: 'The whole app as one immutable value.',
        outline: ['One value', 'A pure step', 'Checked against Schemas'],
        soon: true,
      },
      {
        slug: 'history',
        title: 'History and Replay',
        summary: 'A tree of Messages, like git commits.',
        outline: ['Branches', 'Replay', 'Window and Restore'],
        soon: true,
      },
      {
        slug: 'routing',
        title: 'Routing',
        summary: 'A page is an Actor with a place in the URL.',
        outline: ['Pages', 'The Router', 'Loaders and the Data cache'],
        soon: true,
      },
      {
        slug: 'start',
        title: 'Start',
        summary: 'From a URL to HTML, then hydrated.',
        outline: ['Render Modes', 'Three tiers', 'Platforms'],
        soon: true,
      },
    ],
  },
  {
    title: 'Guides',
    docs: [
      {
        slug: 'testing',
        title: 'Testing an Actor',
        summary: 'Send Messages, read the Snapshot, on a test clock.',
        outline: ['Pure steps', 'Running Workers', 'A test clock'],
        soon: true,
      },
      {
        slug: 'forms',
        title: 'Forms',
        summary: 'A draft in the Model, saved by a Command.',
        outline: ['The draft', 'Saving', 'Errors'],
        soon: true,
      },
      {
        slug: 'auth-gate',
        title: 'A sign-in gate',
        summary: 'States that decide what a signed-out visitor sees.',
        outline: ['The gate', 'The session'],
        soon: true,
      },
      {
        slug: 'tanstack',
        title: 'Inside TanStack Start',
        summary: 'Run a kabuki app on a catch-all route.',
        outline: ['The adapter', 'The catch-all route'],
        soon: true,
      },
      {
        slug: 'deploy-cloudflare',
        title: 'Deploy to Cloudflare',
        summary: 'A Worker, its assets, and its domain.',
        outline: ['Build', 'Deploy', 'Previews'],
        soon: true,
      },
      {
        slug: 'devtools',
        title: 'The devtools',
        summary: 'The Timeline, the Map, and past Steps.',
        outline: ['Opening them', 'The Timeline', 'The Map'],
        soon: true,
      },
    ],
  },
  {
    title: 'Examples',
    docs: [
      {
        slug: 'opening-an-app',
        title: 'Opening an app',
        summary: 'Every concept in one story, drawn as the tree.',
      },
      {
        slug: 'routing-tour',
        title: 'A tour of routing',
        summary: 'Every routing case, one URL each, on Start.',
      },
    ],
  },
  {
    title: 'Why kabuki',
    docs: [
      {
        slug: 'design-notes',
        title: 'Design notes',
        summary: 'Each decision, and why it was made.',
        outline: ['Core', 'History', 'Routing', 'Start'],
        soon: true,
      },
      {
        slug: 'compared',
        title: 'Compared',
        summary: 'Next to React state, Redux and XState.',
        outline: ['React state', 'Redux', 'XState'],
        soon: true,
      },
    ],
  },
] as const satisfies ReadonlyArray<Section>;

/** Every docs page, in reading order. */
export const DOCS: ReadonlyArray<Doc> = SECTIONS.flatMap(
  (section): ReadonlyArray<Doc> => section.docs,
);

/** A docs page's slug: what its URL ends with. */
export type Slug = (typeof SECTIONS)[number]['docs'][number]['slug'];

/** A written page's slug: one whose MDX the client must register. */
export type Written = Exclude<
  (typeof SECTIONS)[number]['docs'][number],
  { readonly soon: true }
>['slug'];

export const SLUGS = DOCS.map((doc) => doc.slug) as unknown as readonly [
  Slug,
  ...Array<Slug>,
];

/** The docs page with this slug. */
export const docOf = (slug: Slug): Doc =>
  DOCS.find((doc) => doc.slug === slug)!;

/** The section a docs page is in. */
export const sectionOf = (slug: Slug): Section =>
  SECTIONS.find((section) => section.docs.some((doc) => doc.slug === slug))!;

/** An outline heading's id, for its anchor. */
export const anchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
