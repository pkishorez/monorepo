import { createContext, use } from 'react';
import type { SavedHistory } from '../../../core/history/index.ts';
import type { View } from '../../../react/index.ts';
import type { Tag } from '../../../routing/route/index.ts';

/*
 * The Page: what one drawing of the Document holds, worked out by the server
 * for one URL and read back by the browser before it hydrates, so the
 * Document draws the same on both. `<Start.Head />` and `<Start.Scripts />`
 * read it from React context; the server writes it in the page as JSON, the
 * browser reads that JSON. The Metadata is drawn by the server alone.
 */

/** A script Start writes in the head: Vite's client and React Refresh in dev. */
export interface Script {
  readonly src?: string;
  readonly code?: string;
}

/** The files one entry, or one lazy View, needs: its script, its styles and the chunks it imports. */
export interface Assets {
  readonly script: string;
  readonly styles: ReadonlyArray<string>;
  readonly preloads: ReadonlyArray<string>;
}

/** What the Vite plugin gives the Worker about the build. */
export interface Build {
  /** Changes on every build: the key the cache keeps static pages under. None in dev, where nothing is cached. */
  readonly id: string | undefined;
  /** Vite's `base`: where every file is served from. */
  readonly base: string;
  /** The client entry's files. */
  readonly entry: Assets;
  /** Each lazy View's files, by its id; `null` in dev, where a View's module is served at `base` and its id. */
  readonly views: Readonly<Record<string, Assets>> | null;
  /** Scripts the head needs before anything else: Vite's client and React Refresh in dev. */
  readonly head: ReadonlyArray<Script>;
}

/** When the server drew a page, and which build drew it. */
export interface Drawing {
  /** When it was drawn, in milliseconds since the epoch: after its Loaders answered. */
  readonly at: number;
  /** The build that drew it; none in dev. */
  readonly build: string | undefined;
}

/** What the browser needs to draw the Document as the server did: its files, the History the app is drawn from, and when it was drawn. In the App Shell the app is not drawn: the browser draws it. */
export interface Page {
  readonly entry: Assets;
  readonly head: ReadonlyArray<Script>;
  /** None in the App Shell, which the browser starts at its own URL. */
  readonly saved?: SavedHistory;
  readonly drawn: Drawing;
  /** The script that puts the page's scroll back before the app hydrates, if the Router restores it here. */
  readonly scroll?: string;
}

/**
 * A Page and the JSON it is written as, the same text on the server and in
 * the browser; on the server, the Metadata too. The browser leaves the
 * Metadata the server drew to the Router, which writes it after every move.
 */
export interface Drawn {
  readonly page: Page;
  readonly json: string;
  readonly metadata?: {
    readonly title: string | undefined;
    readonly tags: ReadonlyArray<Tag>;
  };
}

/** The id of the script that holds the Page as JSON. */
export const ID = 'kabuki-start';

export const PageContext = createContext<Drawn | undefined>(undefined);

/** How the Document reads the running app: the browser's App's `useRuntime`. A server has none. */
export const RuntimeContext = createContext<
  (() => View.AppRuntime) | undefined
>(undefined);

export const usePage = (what: string): Drawn => {
  const drawn = use(PageContext);
  if (!drawn)
    throw new Error(
      `[@kestack/kabuki/start] ${what} is drawn outside Start: only the Document Start serves can draw it`,
    );
  return drawn;
};

/** JSON safe inside a `<script>`: no `</script>`, no `<!--`, no line separators JavaScript reads as line ends. */
export const serialize = (page: Page): Omit<Drawn, 'metadata'> => ({
  page,
  json: JSON.stringify(page)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029'),
});

/** The Page a server wrote in this document, read back as it was written. */
export const readPage = (document: Document): Drawn => {
  const json = document.getElementById(ID)?.textContent;
  if (!json)
    throw new Error(
      `[@kestack/kabuki/start] this page holds no #${ID} script: was it drawn by Start, with <Start.Scripts /> in its Document?`,
    );
  return { page: JSON.parse(json) as Page, json };
};
