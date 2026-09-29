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

/** What the Auth Worker hands its pages app on every request. */
export interface PagesContext {
  branding: Branding;
  authorizationServer?:
    | { scopes: Readonly<Record<string, string>> }
    | undefined;
  /** The Signed-in Account limit for this browser. */
  multiSession: { maximumAccounts: number };
}
