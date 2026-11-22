import { kabukiRoutes } from '@kestack/devtools-kabuki/server';

/*
 * The Kabuki Tool, the server's side: the WebSocket routes a running
 * Kabuki app dials, and the ones the Tool and the CLI read Kabuki Sessions
 * through, all under `/kabuki/`.
 */

export interface KabukiServerOptions {
  /** The origins DevTools' own page is opened at: only they may list and reach Kabuki Sessions. */
  readonly origins: ReadonlyArray<string>;
}

/** Every Kabuki route, sharing one registry of the Kabuki Sessions live now. */
export const kabukiServer = (options: KabukiServerOptions) =>
  kabukiRoutes({ origins: options.origins });

/** What each Kabuki route is, for `/health`. */
export const kabukiEndpoints: Readonly<Record<string, string>> = {
  '/kabuki/connect':
    'WebSocket a running Kabuki app dials as a Kabuki Session: ?name=&url=&app=. Any origin.',
  '/kabuki/sessions':
    'WebSocket RPC: the live Kabuki Sessions, listed and watched.',
  '/kabuki/session/:name':
    "WebSocket RPC: one Kabuki Session's Kabuki Session Api, forwarded to its app.",
};
