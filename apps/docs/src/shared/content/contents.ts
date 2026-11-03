/*
 * A package's table of contents, the one shape every package's docs are
 * written in: sections, each holding its pages in groups of at most three.
 * A page's slug is its URL under the package, unique across its sections,
 * so a page can move without its URL changing. A section with a `path` is
 * a Part: it is named and pathed as the piece of the package it teaches.
 */

export type Doc<S extends string = string> = {
  readonly slug: S;
  readonly title: string;
  readonly summary: string;
};

/** Pages that are read together, under a title of their own or none. */
export type Group<S extends string = string> = {
  readonly title?: string;
  readonly docs: ReadonlyArray<Doc<S>>;
};

export type Section<S extends string = string> = {
  readonly title: string;
  /** A Part's import path, said at the top of its pages. */
  readonly path?: string;
  readonly groups: ReadonlyArray<Group<S>>;
};

/** A page that opens full screen in a new tab, listed after the docs page it belongs to. */
export type FullScreen = {
  readonly title: string;
  readonly summary: string;
  readonly href: string;
  /** The docs page it is listed under. */
  readonly after: string;
};

/** The shape a table is written in, before its slugs are known. */
export type Written = ReadonlyArray<{
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

/** The slugs a written table holds. */
export type SlugOf<T extends Written> =
  T[number]['groups'][number]['docs'][number]['slug'];

export type Contents<S extends string = string> = {
  /** Every section, in the order the sidebar shows them. */
  readonly sections: ReadonlyArray<Section<S>>;
  /** The Parts, in the order they are read: each uses the ones before it. */
  readonly parts: ReadonlyArray<Section<S>>;
  /** Every docs page, in reading order. */
  readonly docs: ReadonlyArray<Doc<S>>;
  readonly slugs: readonly [S, ...Array<S>];
  readonly fullScreen?: FullScreen;
  // Methods, so a package's own Contents is a `Contents` of any slug.
  docOf(slug: S): Doc<S>;
  sectionOf(slug: S): Section<S>;
  groupOf(slug: S): Group<S>;
};

/** A package's contents, from its written table. */
export const contents = <T extends Written>(
  table: T,
  fullScreen?: FullScreen,
): Contents<SlugOf<T>> => {
  type S = SlugOf<T>;
  const sections = table as unknown as ReadonlyArray<Section<S>>;
  const docs = sections.flatMap((section) =>
    section.groups.flatMap((group) => group.docs),
  );
  const sectionOf = (slug: S) =>
    sections.find((section) =>
      section.groups.some((group) =>
        group.docs.some((doc) => doc.slug === slug),
      ),
    )!;
  return {
    sections,
    parts: sections.filter((section) => section.path !== undefined),
    docs,
    slugs: docs.map((doc) => doc.slug) as unknown as readonly [S, ...Array<S>],
    ...(fullScreen ? { fullScreen } : {}),
    docOf: (slug) => docs.find((doc) => doc.slug === slug)!,
    sectionOf,
    groupOf: (slug) =>
      sectionOf(slug).groups.find((group) =>
        group.docs.some((doc) => doc.slug === slug),
      )!,
  };
};

/** A heading's id, for its anchor. */
export const anchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
