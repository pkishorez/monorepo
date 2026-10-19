import { verifyRefreshing } from '@kestack/auth-toolkit/server/http';
import type { Member } from '../../../shared/contracts/member/index.ts';
import { isInvited } from './invites.ts';
import { asVerified, authOptions } from './sign-in.ts';

/*
 * Who a request is from, as Console sees it: nobody, someone the Auth
 * Worker could not be asked about, someone signed in but not on the Invite
 * list, or an invited member. Both doors ask this, once per request: `/rpc`
 * before it opens a socket, and the pages before they are drawn.
 */

export type Visit =
  | { readonly _tag: 'SignedOut' }
  | { readonly _tag: 'Unreachable' }
  | { readonly _tag: 'NotInvited'; readonly email: string }
  | {
      readonly _tag: 'Admitted';
      readonly member: Member;
      /** When their session ends, in milliseconds since the epoch. */
      readonly until: number;
      /** When they were verified, in milliseconds since the epoch. */
      readonly at: number;
    };

/** Who a request is from, and the Sign-in cookies its response must carry. */
export interface Visited {
  readonly visit: Visit;
  /** `set-cookie` values the Auth Worker refreshed while verifying. */
  readonly cookies: ReadonlyArray<string>;
}

/** Who `request` is from; `invites` is the Invite list as the Worker's var writes it. */
export const visitorOf = async (
  request: Request,
  invites: string,
): Promise<Visited> => {
  let resolved: Awaited<ReturnType<typeof verifyRefreshing>>;
  try {
    resolved = await verifyRefreshing(asVerified(request), authOptions);
  } catch {
    return { visit: { _tag: 'Unreachable' }, cookies: [] };
  }
  if (resolved === null) return { visit: { _tag: 'SignedOut' }, cookies: [] };
  const { principal, refreshedCookies: cookies } = resolved;
  const { id, email, name } = principal.user;
  if (!isInvited(invites, email))
    return { visit: { _tag: 'NotInvited', email }, cookies };
  return {
    cookies,
    visit: {
      _tag: 'Admitted',
      member: { userId: id, email, name },
      until:
        principal.kind === 'session'
          ? new Date(principal.session.expiresAt).getTime()
          : Date.now(),
      at: Date.now(),
    },
  };
};
