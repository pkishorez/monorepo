/*
 * Every word on kabuki's landing page after its first screen, in the order
 * the page reads: the five ideas, where they come from, and who makes it.
 * Each stop names the shape the particle field takes while it is read; on
 * a wide screen that shape takes the right half and the words the left.
 * In a body, `backticks` mark code. Package names are lowercase, always.
 */

export type Idea = {
  readonly shape: string;
  /** A word or two after the number, in mono. */
  readonly label: string;
  readonly title: string;
  readonly body: string;
};

export const IDEAS: ReadonlyArray<Idea> = [
  {
    shape: 'actor',
    label: 'actors',
    title: 'Actor is the building block.',
    body: 'Each piece of logic gets an Actor of its own: the Model it holds, the Messages that change it, and the View that draws it. The View sends a Message, the Actor updates, and the View follows.',
  },
  {
    shape: 'states',
    label: 'states',
    title: 'States decide what runs.',
    body: 'Give an Actor a State machine. What it draws, and the Children and Workers it runs, exist only in the State that owns them. Leave the State and they stop, with nothing to clean up.',
  },
  {
    shape: 'compose',
    label: 'children',
    title: 'Actors compose.',
    body: 'Put Actors inside Actors. Some Children last as long as their parent; others only while it is in a given State. The parent draws whichever exist through `children`.',
  },
  {
    shape: 'renders',
    label: 'renders',
    title: 'Surgical updates only.',
    body: 'React draws; kabuki decides when. A Message re-renders the one Actor whose Model it changed, and nothing else. No memo, no selectors, nothing to tune.',
  },
  {
    shape: 'rewind',
    label: 'history',
    title: 'Rewind anything.',
    body: 'Every Message is kept, like git commits. Step back to any one and the app goes with you. Branch from there and carry on, while the app keeps running.',
  },
];

export const PRIOR_ART = {
  shape: 'lineage',
  label: 'prior art',
  title: 'Where it comes from.',
  pitch:
    'kabuki is built from ideas that already work. Here is what it took from each.',
  sources: [
    {
      name: 'Elm',
      href: 'https://elm-lang.org',
      line: 'The architecture, and its names: Model, Message, Update, Command, View.',
    },
    {
      name: 'Foldkit',
      href: 'https://github.com/foldkit/foldkit',
      line: 'The Elm architecture on Effect, the way kabuki builds it.',
    },
    {
      name: 'statecharts',
      href: 'https://statecharts.dev',
      line: 'State. A tree of Actors is a statechart, written as plain functions.',
    },
    {
      name: 'the actor model',
      line: 'One mailbox. Messages are the only way an Actor changes.',
    },
    {
      name: 'Effect',
      href: 'https://effect.website',
      line: 'All the work, in scopes, with typed capabilities.',
    },
    {
      name: 'React',
      line: 'The drawing, and nothing else.',
    },
  ],
} as const satisfies {
  readonly shape: string;
  readonly label: string;
  readonly title: string;
  readonly pitch: string;
  readonly sources: ReadonlyArray<{
    readonly name: string;
    readonly href?: string;
    readonly line: string;
  }>;
};

export const AUTHOR = {
  shape: 'mark',
  label: 'who makes it',
  name: 'Kishore',
  avatar: 'https://github.com/pkishorez.png',
  github: { handle: '@pkishorez', href: 'https://github.com/pkishorez' },
  site: { label: 'kishore.app', href: 'https://kishore.app' },
  monorepo: 'https://github.com/pkishorez/monorepo',
  /** The words around the link to the monorepo. */
  line: {
    before: 'I build kabuki in the open, in the ',
    link: 'ke stack monorepo',
    after: ', next to everything else I make. These docs are a kabuki app too.',
  },
} as const;
