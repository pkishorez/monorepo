export type EmbeddedAsset =
  | { type: string; body: string }
  | { type: string; base64: string };

export type BrandStyle = Readonly<Record<string, string | number>>;

/** What the pages show; each part optionally carries inline CSS. */
export interface Branding {
  appName: string | { name: string; style?: BrandStyle | undefined };
  /** Also the favicon. */
  logoUrl?:
    | string
    | { url: string; style?: BrandStyle | undefined }
    | undefined;
}

export interface PagesContext {
  branding: Branding;
  authorizationServer?:
    | { scopes: Readonly<Record<string, string>> }
    | undefined;
  /** Present when the browser may hold several Signed-in Accounts. */
  multiSession?: { maximumAccounts: number } | undefined;
}

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
