import type { PagesContext } from '../../auth-worker-contract/index.js';

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
