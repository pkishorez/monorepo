import type { User } from '../contract/index.js';

/** The Sign-in a Sign-in Principal holds, as better-auth's session. */
export interface SignIn {
  readonly id: string;
  readonly expiresAt: Date;
}

/** A Principal established by a Sign-in, from a browser cookie or a Device
 * token the Auth Worker issued. better-auth calls the record a session,
 * hence the `kind`. */
export interface SignInPrincipal {
  readonly kind: 'session';
  readonly user: User;
  readonly session: SignIn;
  /** Whether the User is a Test User: their email ends in `.test`. */
  readonly test: boolean;
}

/** A Principal established by an Access Token: the User, the OAuth Client
 * acting for them, and the granted Scopes. It has no Sign-in. */
export interface TokenPrincipal {
  readonly kind: 'token';
  readonly user: User;
  readonly client: { readonly id: string };
  readonly scopes: ReadonlyArray<string>;
  /** Whether the User is a Test User: their email ends in `.test`. */
  readonly test: boolean;
}

export type Principal = SignInPrincipal | TokenPrincipal;
