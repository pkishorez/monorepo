import type { BrowserReads } from './browser-api.js';
import type { Brand } from './config.js';

/** What the Auth Worker hands its pages app on every request. */
export interface PagesContext {
  brand: Brand;
  /** Accounts one browser may hold. */
  maxAccounts: number;
  /** The Shared Cookie Domain without its leading dot: a page may send the
   * browser back to an app under it. */
  cookieDomain: string;
  /** The Auth Worker's own origin. */
  origin: string;
  /** With the Authorization Server Role on: every Scope, in words. */
  oauth?: { scopes: Readonly<Record<string, string>> } | undefined;
  /** This browser's Accounts, Sign-ins, Grants and requests, for the pages'
   * Loaders to draw each page with its data; never a token. */
  reads: BrowserReads;
}

export type EmbeddedAsset =
  | { type: string; body: string }
  | { type: string; base64: string };

/** Supplied by the built `worker` door; absent when imported from source. */
export interface PagesApp {
  fetch: (request: Request, context: PagesContext) => Promise<Response>;
  assets: Readonly<Record<string, EmbeddedAsset>>;
}

const decodeBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const assetResponse = (asset: EmbeddedAsset) =>
  new Response('body' in asset ? asset.body : decodeBase64(asset.base64), {
    headers: {
      'content-type': asset.type,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });

export const servePages = (
  pages: PagesApp,
  request: Request,
  context: PagesContext,
): Promise<Response> => {
  const asset = pages.assets[new URL(request.url).pathname];
  return asset
    ? Promise.resolve(assetResponse(asset))
    : pages.fetch(request, context);
};
