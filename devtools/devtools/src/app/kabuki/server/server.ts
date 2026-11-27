import { kabukiRoutes } from '@kestack/devtools-kabuki/devtools';

export interface KabukiServerOptions {
  readonly origins: ReadonlyArray<string>;
}

export const kabukiServer = (options: KabukiServerOptions) =>
  kabukiRoutes({ origins: options.origins });

export const kabukiEndpoints: Readonly<Record<string, string>> = {
  '/kabuki/connect':
    'WebSocket a running Kabuki app dials as a Kabuki Session: ?name=&url=&app=. Any origin.',
  '/kabuki/sessions':
    'WebSocket RPC: the live Kabuki Sessions, listed and watched.',
  '/kabuki/session/:name':
    "WebSocket RPC: one Kabuki Session's nine calls, passed to its app.",
};
