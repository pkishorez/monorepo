/** Makes a backend a Resource Server: it also accepts Access Tokens the
 * Auth Worker issued for `resource`. */
export interface OAuthOptions {
  /** This Resource Server's URL, as listed in the Auth Worker's
   * `oauth.resources`, e.g. `https://mcp.example.com`. */
  readonly resource: string;
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

/** Throws unless `options` name the Auth Worker's `url`; `local` is refused
 * by name, so an app still on Local mode is told where it went. */
export const checkOptions = (options: AuthOptions): void => {
  const { url, local } = options as { url?: unknown; local?: unknown };
  if (local !== undefined) {
    throw new Error(
      "auth: `local` was removed; the browser environment's guard is `fakeGuard` from @kestack/auth-toolkit/fake.",
    );
  }
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error("auth: give the Auth Worker's `url`.");
  }
};
