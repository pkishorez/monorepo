import type { Session, User } from 'better-auth';
import type { User as TokenUser } from '../contract/index.js';

/** A Principal established by a Sign-in, from a browser cookie or a token
 * the sign-in service issued. better-auth calls the record a session, hence
 * the `kind`. */
export interface SignInPrincipal {
  readonly kind: 'session';
  readonly user: User;
  readonly session: Session;
}

/** A Principal established by an Access Token: the User, the Client
 * Application acting for them, and the granted Scopes. It has no Sign-in. */
export interface TokenPrincipal {
  readonly kind: 'token';
  readonly user: TokenUser;
  readonly client: { readonly id: string };
  readonly scopes: ReadonlyArray<string>;
}

export type Principal = SignInPrincipal | TokenPrincipal;
