import { use, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ID, PageContext, usePage } from '../page/index.ts';

/*
 * The Document's two parts Start fills: `<Start.Head />` in its `<head>`,
 * `<Start.Scripts />` at the end of its `<body>`. Each draws the Page of the
 * request, which the server works out and the browser reads back, so the
 * Document hydrates as it was drawn. Lazy Views' files are added to the head
 * by the server once the page is drawn, after these.
 */

/**
 * The Metadata, the styles and the preloads, in the order the browser wants
 * them: the charset and viewport first, then the title and every Metadata
 * tag, then the entry's styles and the chunks it imports. The Metadata is
 * drawn on the server only: in the browser the Router writes it after every
 * move, so React leaves the tags the server drew alone.
 */
function Head() {
  const { page, metadata } = usePage('<Start.Head />');
  return (
    <>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {metadata?.title !== undefined && <title>{metadata.title}</title>}
      {metadata?.tags.map(({ tag: Tag, attributes }, at) => (
        <Tag key={at} {...attributes} />
      ))}
      {page.head.map((script, at) =>
        script.src !== undefined ? (
          <script key={`h${at}`} type="module" src={script.src} />
        ) : (
          <script
            key={`h${at}`}
            type="module"
            dangerouslySetInnerHTML={{ __html: script.code ?? '' }}
          />
        ),
      )}
      {page.entry.styles.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {page.entry.preloads.map((href) => (
        <link key={href} rel="modulepreload" href={href} />
      ))}
    </>
  );
}

/** The Page as JSON, which the browser starts from, and the client entry that does it. */
function Scripts() {
  const { page, json } = usePage('<Start.Scripts />');
  return (
    <>
      <script
        type="application/json"
        id={ID}
        dangerouslySetInnerHTML={{ __html: json }}
      />
      <script type="module" src={page.entry.script} />
    </>
  );
}

const never = () => () => {};

/**
 * When the server drew this page, and by which build; and whether the
 * component that asks was in that drawing, `hydrated`, or was drawn later
 * by the browser, after a move. `null` outside a page Start served, as in a
 * test or a story. A component keeps its answer for as long as it is
 * mounted.
 */
function useDrawn(): Start.Drawn | null {
  const drawn = use(PageContext);
  // A server's snapshot is read on the server and while hydrating what it drew.
  const hydrating = useSyncExternalStore(
    never,
    () => false,
    () => true,
  );
  const [hydrated] = useState(hydrating);
  if (!drawn) return null;
  return { ...drawn.page.drawn, hydrated };
}

/**
 * The parts of the Document Start fills: `<Start.Head />` goes in its
 * `<head>`, `<Start.Scripts />` at the end of its `<body>`; and
 * `Start.useDrawn()`, when and by which build the server drew the page.
 */
export const Start = { Head, Scripts, useDrawn };

export declare namespace Start {
  /** What the Document is drawn with: the app, as its children, to put in `<body>`. */
  export interface DocumentProps {
    readonly children: ReactNode;
  }

  /** What `Start.useDrawn()` gives: when and by which build the server drew the page, and whether the component asking was in it. */
  export interface Drawn {
    /** When the server drew the page, in milliseconds since the epoch, after its Loaders answered. */
    readonly at: number;
    /** The build that drew it; none in dev. */
    readonly build: string | undefined;
    /** Whether the component asking was drawn by the server and hydrated, rather than by the browser after. */
    readonly hydrated: boolean;
  }
}
