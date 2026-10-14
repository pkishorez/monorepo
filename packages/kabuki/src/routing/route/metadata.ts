/*
 * Metadata: what a place says about itself to the browser and to search.
 * Written in the Routes, as a value or from the place's params and Input,
 * and merged from the root down: the deepest place that says a field wins.
 */

/** A place's title, description and the tags that link and share it. */
export interface Metadata {
  readonly title?: string;
  readonly description?: string;
  /** The one URL this page is known by, whole: `https://acme.dev/blog/hello`. */
  readonly canonical?: string;
  readonly openGraph?: {
    readonly title?: string;
    readonly description?: string;
    readonly image?: string;
    readonly type?: string;
    readonly url?: string;
  };
  /** As the `robots` meta tag says it: `noindex, nofollow`. */
  readonly robots?: string;
  /** More `<meta>` tags, as written. */
  readonly meta?: ReadonlyArray<{
    readonly name?: string;
    readonly property?: string;
    readonly content: string;
  }>;
  /** More `<link>` tags, as written. */
  readonly link?: ReadonlyArray<
    { readonly rel: string; readonly href: string } & {
      readonly [attribute: string]: string;
    }
  >;
}

/** The attribute on every tag Metadata writes, so only those are replaced after a move. */
export const MANAGED = 'data-kabuki';

/** One tag Metadata writes besides the title: its element and its attributes, `data-kabuki` among them. */
export interface Tag {
  readonly tag: 'meta' | 'link';
  readonly attributes: Readonly<Record<string, string>>;
}

/** `below` over `above`, field by field, Open Graph's fields too. */
export const merge = (above: Metadata, below: Metadata): Metadata => {
  const openGraph =
    above.openGraph || below.openGraph
      ? { ...above.openGraph, ...below.openGraph }
      : undefined;
  return { ...above, ...below, ...(openGraph ? { openGraph } : {}) };
};

const meta = (key: 'name' | 'property', name: string, content?: string) =>
  content === undefined
    ? []
    : [{ tag: 'meta' as const, attributes: { [key]: name, content } }];

/**
 * Every tag Metadata writes besides the title, in order: what a server draws
 * in the Document's head, and what the browser replaces after each move.
 */
export const tagsOf = (metadata: Metadata): ReadonlyArray<Tag> =>
  written(metadata).map(({ tag, attributes }) => ({
    tag,
    attributes: { ...attributes, [MANAGED]: '' },
  }));

const written = (metadata: Metadata): ReadonlyArray<Tag> => {
  const og = metadata.openGraph ?? {};
  return [
    ...meta('name', 'description', metadata.description),
    ...meta('name', 'robots', metadata.robots),
    ...(metadata.canonical === undefined
      ? []
      : [
          {
            tag: 'link' as const,
            attributes: { rel: 'canonical', href: metadata.canonical },
          },
        ]),
    ...meta('property', 'og:title', og.title),
    ...meta('property', 'og:description', og.description),
    ...meta('property', 'og:image', og.image),
    ...meta('property', 'og:type', og.type),
    ...meta('property', 'og:url', og.url),
    ...(metadata.meta ?? []).map((each) => ({
      tag: 'meta' as const,
      attributes: Object.fromEntries(
        Object.entries(each).filter(([, value]) => value !== undefined),
      ) as Record<string, string>,
    })),
    ...(metadata.link ?? []).map((each) => ({
      tag: 'link' as const,
      attributes: { ...each },
    })),
  ];
};
