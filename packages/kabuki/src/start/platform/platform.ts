/*
 * Where Start runs: the port every platform's adapter fills, each in a
 * folder of its own under this one, imported from its own subpath, so a
 * build carries only the adapter it names.
 *
 * - At build time, the Vite plugin reads a `Platform`: how to resolve the
 *   server's dependencies, and which adapter function turns Start's
 *   `Handler` into what the platform runs.
 * - At run time, that adapter function hands every request to the
 *   `Handler` with a `Host`: the platform's env and, if it has one, a
 *   `PageCache`.
 */

/** Where static pages are kept, by a key Start makes from the build id and the URL. */
export interface PageCache {
  readonly match: (key: Request) => Promise<Response | undefined>;
  readonly put: (key: Request, response: Response) => Promise<void>;
}

/** What a platform hands Start with each request. */
export interface Host {
  /** Its bindings and secrets: what the Loaders' Layers are made from. */
  readonly env: unknown;
  /** Where static pages are kept; with none, every page is drawn. */
  readonly cache?: PageCache;
}

/** What Start answers requests with, on any platform. */
export interface Handler {
  readonly fetch: (request: Request, host: Host) => Promise<Response>;
}

/** What the Vite plugin needs to know of a platform to build for it. */
export interface Platform {
  readonly name: string;
  /** The conditions the server build resolves its dependencies with. */
  readonly conditions: ReadonlyArray<string>;
  /**
   * The adapter function the server entry wraps Start's `Handler` in, by
   * module and export: the entry default-exports `serve(handler)`.
   */
  readonly serve: { readonly from: string; readonly name: string };
}
