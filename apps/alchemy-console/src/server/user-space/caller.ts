import { Context, Schema } from 'effect';
import type { SignInPrincipal } from '@kestack/auth-toolkit';
import { Member } from '../../shared/contracts/member/index.ts';

/*
 * Who a request to a User Space is from. The Worker verified the session and
 * the invite, chose this object by the member's id, and says who in one
 * header it sets over anything the browser sent. A User Space is reached
 * only through its namespace binding, so it trusts the header and asks
 * nobody again.
 */

const HEADER = 'x-console-caller';

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Member));

/** `request`, saying it is from `member`, whatever it said before. */
export const sentBy = (request: Request, member: Member): Request => {
  const headers = new Headers(request.headers);
  headers.set(HEADER, JSON.stringify(member));
  return new Request(request, { headers });
};

/** Who the Worker said a request is from; null when it said nobody. */
export const senderOf = (headers: {
  readonly [name: string]: string | undefined;
}): Member | null => {
  const header = headers[HEADER];
  if (header === undefined) return null;
  const member = decode(header);
  return member._tag === 'Some' ? member.value : null;
};

/** The caller of the socket a call arrives on, kept with the socket. */
export const SocketCaller = Context.Reference<Member | null>(
  'alchemy-console/UserSpace/SocketCaller',
  { defaultValue: () => null },
);

// A verified caller has no Sign-in of their own here, so its dates are fixed.
const EPOCH = new Date(0);

/** The Principal a guarded handler reads for `member`. */
export const principalOf = (member: Member): SignInPrincipal => ({
  kind: 'session',
  user: {
    id: member.userId,
    email: member.email,
    name: member.name,
    emailVerified: true,
    image: null,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  },
  session: {
    id: `console:${member.userId}`,
    token: '',
    userId: member.userId,
    expiresAt: EPOCH,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ipAddress: null,
    userAgent: null,
  },
});
