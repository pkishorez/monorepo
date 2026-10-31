import { Context } from 'effect';

/*
 * Where an app's address lives: the port each adapter fills, each in a
 * folder of its own under this one, imported from its own subpath, so an
 * app carries only the adapter it uses: `browser/` for the browser's own
 * history, `tanstack/` for TanStack Router's.
 */

/**
 * Where an app's Address lives, besides memory: the browser's own history or
 * TanStack Router's. Every URL here is a whole path with its query, base
 * included. An entry's key is what the router stamps on each history entry it
 * writes, so Back and Forward land on an entry it knows. With no Adapter in
 * the Layer, the app routes in memory and never touches a URL.
 */
export interface AdapterShape {
  /** The URL shown now: path and query. */
  readonly url: () => string;
  /** The element on the page the URL names now, after its `#`, decoded; none if it names none. */
  readonly hash?: () => string;
  /** The key the router stamped on the entry shown now, if it wrote it. */
  readonly key: () => string | null;
  /** Hear every change of the URL, whoever made it; gives back how to stop. */
  readonly listen: (changed: () => void) => () => void;
  readonly push: (url: string, key: string) => void;
  readonly replace: (url: string, key: string) => void;
  /** Move through the history by `by` entries: -1 is Back. */
  readonly go: (by: number) => void;
  /**
   * Go to a URL outside the app's base, or another site: hand it to whoever
   * owns it. `replace` takes the place of the entry shown, as a Redirect does.
   */
  readonly leave: (
    url: string,
    options?: { readonly replace?: boolean },
  ) => void;
}

export class Adapter extends Context.Service<Adapter, AdapterShape>()(
  '@kestack/kabuki/routing/Adapter',
) {}

/** The key the router keeps in a history entry's state. */
export const KEY = '@kestack/kabuki/routing';

/** The key in a history entry's state, if the router wrote one. */
export const keyIn = (state: unknown): string | null => {
  const found = (state as Record<string, unknown> | null | undefined)?.[KEY];
  return typeof found === 'string' ? found : null;
};
