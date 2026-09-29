import type { Session, User } from 'better-auth';
import type { User as TokenUser } from '../../../auth-worker-contract/index.js';

/** A Principal established by a browser Session. */
export interface SessionPrincipal {
  readonly kind: 'session';
  readonly user: User;
  readonly session: Session;
}

/** A Principal established by an Access Token: the User, the Client
 * Application acting for them, and the granted Scopes. It has no Session. */
export interface TokenPrincipal {
  readonly kind: 'token';
  readonly user: TokenUser;
  readonly client: { readonly id: string };
  readonly scopes: ReadonlyArray<string>;
}

export type Principal = SessionPrincipal | TokenPrincipal;
