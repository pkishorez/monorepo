import { Context, Schema } from 'effect';
import type { SignInPrincipal } from '@kestack/auth-toolkit';
import { Member } from '../../shared/contracts/member/index.ts';

/*
 * Who a request to a User Space is from, and until when. The Worker
 * verified the session and the invite, chose this object by the member's
 * id, and says who in one header it sets over anything the browser sent. A
 * User Space is reached only through its namespace binding, so it trusts
 * the header and asks nobody again.
 *
 * A socket outlives the request that opened it, so its caller may act only
 * until their session ends, and an hour at most: after that every call on
 * it is refused, and the browser opens a new one, verified again.
 */

const HEADER = 'x-console-caller';
const SOCKET_HOURS = 1;

export const Caller = Schema.Struct({
  member: Member,
  /** When the caller's session ends, in milliseconds since the epoch. */
  until: Schema.Number,
});
export type Caller = typeof Caller.Type;

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Caller));

/** `request`, saying it is from `caller`, whatever it said before. */
export const sentBy = (request: Request, caller: Caller): Request => {
  const headers = new Headers(request.headers);
  headers.set(HEADER, JSON.stringify(caller));
  return new Request(request, { headers });
};

/** Who the Worker said a request is from; null when it said nobody. */
export const senderOf = (headers: {
  readonly [name: string]: string | undefined;
}): Caller | null => {
  const header = headers[HEADER];
  if (header === undefined) return null;
  const caller = decode(header);
  return caller._tag === 'Some' ? caller.value : null;
};

/** The caller of a socket opened at `now`, for as long as the socket may act for them. */
export const opened = (caller: Caller, now: number): Caller => ({
  ...caller,
  until: Math.min(caller.until, now + SOCKET_HOURS * 60 * 60 * 1000),
});

/** The caller of the socket a call arrives on, kept with the socket. */
export const SocketCaller = Context.Reference<Caller | null>(
  'alchemy-console/UserSpace/SocketCaller',
  { defaultValue: () => null },
);

// A verified caller has no Sign-in of their own here, so its dates are fixed.
const EPOCH = new Date(0);

const principalOf = ({ member, until }: Caller): SignInPrincipal => ({
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
    expiresAt: new Date(until),
    createdAt: EPOCH,
    updatedAt: EPOCH,
    ipAddress: null,
    userAgent: null,
  },
});

/** The Principal a guarded handler reads for `caller` at `now`; null once their time is up. */
export const principalAt = (
  caller: Caller | null,
  now: number,
): SignInPrincipal | null =>
  caller !== null && now < caller.until ? principalOf(caller) : null;
