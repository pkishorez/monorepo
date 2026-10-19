/** Makes a backend a Resource Server: it also accepts Access Tokens the
 * Auth Worker issued for `resource`. */
export interface OAuthOptions {
  /** This Resource Server's URL, as listed in the Auth Worker's
   * `oauth.resources`, e.g. `https://mcp.example.com`. */
  readonly resource: string;
}

/** Who a backend asks about its callers: the Auth Worker at `url`, or, in
 * Local mode, nobody (a Local Token names its User). */
export type AuthOptions<OAuth extends OAuthOptions = OAuthOptions> =
  | {
      /** The Auth Worker's deployed URL, e.g. `https://auth.example.com`. */
      readonly url: string;
      readonly oauth?: OAuth | undefined;
      readonly local?: undefined;
    }
  | { readonly local: true; readonly url?: undefined };

/** Whether `options` are Local mode. Only `local: true` is; options that
 * name both a `url` and `local`, or neither, are refused, so a mistyped
 * config never turns on Local mode, where anyone may be anyone. */
export const isLocal = <OAuth extends OAuthOptions>(
  options: AuthOptions<OAuth>,
): options is Extract<AuthOptions<OAuth>, { readonly local: true }> => {
  const { url, local } = options as { url?: unknown; local?: unknown };
  if (local !== undefined && url !== undefined) {
    throw new Error('auth: give `url` or `local: true`, not both.');
  }
  if (local !== undefined) {
    if (local === true) return true;
    throw new Error('auth: `local` must be `true`; leave it out otherwise.');
  }
  if (typeof url !== 'string' || url === '') {
    throw new Error("auth: give the Auth Worker's `url`, or `local: true`.");
  }
  return false;
};
