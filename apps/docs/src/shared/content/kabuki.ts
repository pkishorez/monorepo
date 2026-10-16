/*
 * kabuki's table of contents: every docs page, in the order the sidebar
 * shows it, grouped into sections. A page's slug is its URL under /kabuki,
 * and unique across sections, so a page can move between sections without
 * its URL changing. Every page here is written: its words are its MDX file,
 * which the client's `docs` registers by slug.
 */

export type Doc = {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
};

export type Section = {
  readonly title: string;
  /** Numbered in the sidebar, counting on from the numbered sections before it. */
  readonly numbered?: true;
  readonly docs: ReadonlyArray<Doc>;
};

export const SECTIONS = [
  {
    title: 'Get started',
    docs: [
      {
        slug: 'introduction',
        title: 'Introduction',
        summary: 'kabuki in one loop, and in the words of React.',
      },
      {
        slug: 'quick-start',
        title: 'Quick start',
        summary: 'A running kabuki app in five minutes.',
      },
    ],
  },
  {
    title: 'The primitives',
    numbered: true,
    docs: [
      {
        slug: 'actor',
        title: 'Actor',
        summary: 'The building block of logic, the way a component is for UI.',
      },
      {
        slug: 'state-machine',
        title: 'State machine',
        summary: 'Conditional logic, the way React has conditional rendering.',
      },
      {
        slug: 'workers',
        title: 'Workers',
        summary: 'Where side effects live, for as long as they should.',
      },
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
      {
        slug: 'view',
        title: 'View',
        summary: 'React draws an Actor, and does nothing else.',
      },
      {
        slug: 'history',
        title: 'History',
        summary: 'Every Message is kept, so you can go back in time.',
      },
    ],
  },
] as const satisfies ReadonlyArray<Section>;

/** The full-screen demo: every primitive in one app, opened in a new tab. */
export const DEMO = {
  title: 'Opening an app',
  summary: 'Every primitive at once, drawn as the tree of Actors.',
  href: '/kabuki/demos/opening-an-app',
} as const;

/** Every docs page, in reading order. */
export const DOCS: ReadonlyArray<Doc> = SECTIONS.flatMap(
  (section): ReadonlyArray<Doc> => section.docs,
);

/** A docs page's slug: what its URL ends with. */
export type Slug = (typeof SECTIONS)[number]['docs'][number]['slug'];

export const SLUGS = DOCS.map((doc) => doc.slug) as unknown as readonly [
  Slug,
  ...Array<Slug>,
];

/** The docs page with this slug. */
export const docOf = (slug: Slug): Doc =>
  DOCS.find((doc) => doc.slug === slug)!;

/** A page's number in the sidebar, if its section is numbered. */
export const numberOf = (slug: Slug): number | undefined => {
  let count = 0;
  for (const section of SECTIONS as ReadonlyArray<Section>) {
    for (const doc of section.docs) {
      if (section.numbered) count++;
      if (doc.slug === slug) return section.numbered ? count : undefined;
    }
  }
  return undefined;
};

/** The section a docs page is in. */
export const sectionOf = (slug: Slug): Section =>
  SECTIONS.find((section) => section.docs.some((doc) => doc.slug === slug))!;

/** A heading's id, for its anchor. */
export const anchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
