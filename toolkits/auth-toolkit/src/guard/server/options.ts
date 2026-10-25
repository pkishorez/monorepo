/** Makes a backend a Resource Server: it also accepts Access Tokens the
 * Auth Worker issued for `resource`. */
export interface OAuthOptions {
  /** This Resource Server's URL, as listed in the Auth Worker's
   * `oauth.resources`, e.g. `https://mcp.example.com`. */
  readonly resource: string;
}

/** `oauth` for `auth.http`, which also publishes its Protected Resource
 * Metadata. */
export interface HttpOAuthOptions extends OAuthOptions {
  /** The Scopes this Resource Server understands, published as
   * `scopes_supported` so an OAuth Client knows what to ask for. */
  readonly scopes?: ReadonlyArray<string> | undefined;
}

/** Who a backend asks about its callers: the Auth Worker at `url`. */
export interface AuthOptions<OAuth extends OAuthOptions = OAuthOptions> {
  /** The Auth Worker's deployed URL, e.g. `https://auth.example.com`. */
  readonly url: string;
  readonly oauth?: OAuth | undefined;
  /** Admit Test Users, whose email ends in `.test`. Refused (Forbidden)
   * unless `true`, whatever their credential. */
  readonly testUsers?: boolean | undefined;
}

/** Throws unless `options` name the Auth Worker's `url`. */
export const checkOptions = ({ url }: AuthOptions): void => {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error("auth: give the Auth Worker's `url`.");
  }
};
