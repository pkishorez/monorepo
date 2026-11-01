/*
 * kabuki's table of contents: every docs page, in the order the sidebar
 * shows it. First how to start; then kabuki's four Parts, each read in
 * turn and each using only the ones before it; last the demos. A section
 * holds its pages in groups, at most three to a group. A page's slug is
 * its URL under /kabuki, unique across sections, so a page can move
 * without its URL changing. Every page here is written: its words are its
 * MDX file, which the client's `docs` registers by slug.
 */

export type Doc = {
  readonly slug: Slug;
  readonly title: string;
  readonly summary: string;
};

/** Pages that are read together, under a title of their own or none. */
export type Group = {
  readonly title?: string;
  readonly docs: ReadonlyArray<Doc>;
};

export type Section = {
  readonly title: string;
  /** A Part's import path, said at the top of its pages. */
  readonly path?: string;
  readonly groups: ReadonlyArray<Group>;
};

/** The shape the table is written in, before its slugs are known. */
type Written = ReadonlyArray<{
  readonly title: string;
  readonly path?: string;
  readonly groups: ReadonlyArray<{
    readonly title?: string;
    readonly docs: ReadonlyArray<{
      readonly slug: string;
      readonly title: string;
      readonly summary: string;
    }>;
  }>;
}>;

const TABLE = [
  {
    title: 'Get started',
    groups: [
      {
        docs: [
          {
            slug: 'introduction',
            title: 'Introduction',
            summary:
              'kabuki in one loop, its four parts, and React’s words for it.',
          },
          {
            slug: 'quick-start',
            title: 'Quick start',
            summary: 'A running kabuki app in five minutes.',
          },
        ],
      },
    ],
  },
  {
    title: 'core',
    path: '@kestack/kabuki',
    groups: [
      {
        title: 'One Actor',
        docs: [
          {
            slug: 'actor',
            title: 'Actor',
            summary:
              'The building block of logic, the way a component is for UI.',
          },
          {
            slug: 'state-machine',
            title: 'State machine',
            summary:
              'Conditional logic, the way React has conditional rendering.',
          },
          {
            slug: 'workers',
            title: 'Workers',
            summary: 'Where side effects live, for as long as they should.',
          },
        ],
      },
      {
        title: 'Many Actors',
        docs: [
          {
            slug: 'children',
            title: 'Children',
            summary: 'Small Actors, composed into bigger ones.',
          },
          {
            slug: 'props',
            title: 'Props',
            summary: 'What a parent hands its Children, as in React.',
          },
          {
            slug: 'capabilities',
            title: 'Capabilities',
            summary:
              'Context for Actors: what a parent offers everything below it.',
          },
        ],
      },
      {
        title: 'Over time',
        docs: [
          {
            slug: 'history',
            title: 'History',
            summary: 'Every Message is kept, so you can go back in time.',
          },
        ],
      },
    ],
  },
  {
    title: 'react',
    path: '@kestack/kabuki/react',
    groups: [
      {
        docs: [
          {
            slug: 'view',
            title: 'View',
            summary: 'React draws an Actor, and does nothing else.',
          },
          {
            slug: 'app',
            title: 'App',
            summary: 'The whole tree as one React component, at any Step.',
          },
        ],
      },
    ],
  },
  {
    title: 'routing',
    path: '@kestack/kabuki/routing',
    groups: [
      {
        docs: [
          {
            slug: 'pages',
            title: 'Pages',
            summary: 'An Actor with a place in the URL.',
          },
          {
            slug: 'moving',
            title: 'Moving',
            summary: 'Links, Back and Forward: each move is one Message.',
          },
          {
            slug: 'data',
            title: 'Data',
            summary: 'Each page’s Loader, loaded before the move lands.',
          },
        ],
      },
    ],
  },
  {
    title: 'start',
    path: '@kestack/kabuki/start',
    groups: [
      {
        docs: [
          {
            slug: 'serving',
            title: 'Serving',
            summary:
              'One request: Loaders, HTML and the Snapshot, then the browser carries on.',
          },
          {
            slug: 'your-app',
            title: 'Your app',
            summary: 'Three files you write; the Vite plugin writes the rest.',
          },
          {
            slug: 'platforms',
            title: 'Platforms',
            summary: 'Cloudflare Workers, or any host Nitro serves.',
          },
        ],
      },
    ],
  },
  {
    title: 'Demos',
    groups: [
      {
        title: 'Small',
        docs: [
          {
            slug: 'counter',
            title: 'Counter',
            summary: 'The smallest kabuki app: one number, three Messages.',
          },
          {
            slug: 'counters',
            title: 'Counters',
            summary: 'A list of Counters, each its own Actor.',
          },
          {
            slug: 'stopwatch',
            title: 'Stopwatch',
            summary: 'A Worker that ticks only while it runs.',
          },
          {
            slug: 'todos',
            title: 'To-dos',
            summary: 'Add, check off and filter a list of to-dos.',
          },
        ],
      },
      {
        title: 'Apps',
        docs: [
          {
            slug: 'checkout',
            title: 'Checkout',
            summary: 'A checkout as a state machine, with steps it can skip.',
          },
          {
            slug: 'shopping-cart',
            title: 'Shopping cart',
            summary:
              'Products, a cart and a checkout, shared through Capabilities.',
          },
          {
            slug: 'managed-resource',
            title: 'Managed resource',
            summary: 'A service that starts with a State and stops with it.',
          },
        ],
      },
      {
        title: 'Showcase',
        docs: [
          {
            slug: 'snake',
            title: 'Snake',
            summary: 'A game you can rewind, and play on from any moment.',
          },
          {
            slug: 'opening-an-app',
            title: 'Opening an app',
            summary: 'A whole app as Actors: it boots, signs in and signs out.',
          },
        ],
      },
    ],
  },
] as const satisfies Written;

/** Every section, in the order the sidebar shows them. */
export const SECTIONS: ReadonlyArray<Section> = TABLE;

/** The four Parts, in the order they are read: each uses the ones before it. */
export const PARTS = SECTIONS.filter((section) => section.path !== undefined);

/** The full-screen demo: every primitive in one app, opened in a new tab, after the demos on pages. */
export const DEMO = {
  title: 'Opening an app',
  summary: 'Every primitive at once, drawn as the tree of Actors.',
  href: '/kabuki/demos/opening-an-app',
} as const;

/** Every docs page, in reading order. */
export const DOCS: ReadonlyArray<Doc> = SECTIONS.flatMap((section) =>
  section.groups.flatMap((group) => group.docs),
);

/** A docs page's slug: what its URL ends with. */
export type Slug =
  (typeof TABLE)[number]['groups'][number]['docs'][number]['slug'];

export const SLUGS = DOCS.map((doc) => doc.slug) as unknown as readonly [
  Slug,
  ...Array<Slug>,
];

/** The docs page with this slug. */
export const docOf = (slug: Slug): Doc =>
  DOCS.find((doc) => doc.slug === slug)!;

/** The section a docs page is in. */
export const sectionOf = (slug: Slug): Section =>
  SECTIONS.find((section) =>
    section.groups.some((group) => group.docs.some((doc) => doc.slug === slug)),
  )!;

/** The group a docs page is in, inside its section. */
export const groupOf = (slug: Slug): Group =>
  sectionOf(slug).groups.find((group) =>
    group.docs.some((doc) => doc.slug === slug),
  )!;

/** A heading's id, for its anchor. */
export const anchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
