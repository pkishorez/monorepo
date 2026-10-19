import { verify } from '@kestack/auth-toolkit/server/http';
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
  | { readonly _tag: 'Admitted'; readonly member: Member };

/** Who `request` is from; `invites` is the Invite list as the Worker's var writes it. */
export const visitorOf = async (
  request: Request,
  invites: string,
): Promise<Visit> => {
  let principal: Awaited<ReturnType<typeof verify>>;
  try {
    principal = await verify(asVerified(request), authOptions);
  } catch {
    return { _tag: 'Unreachable' };
  }
  if (principal === null) return { _tag: 'SignedOut' };
  const { id, email, name } = principal.user;
  if (!isInvited(invites, email)) return { _tag: 'NotInvited', email };
  return { _tag: 'Admitted', member: { userId: id, email, name } };
};
